pragma solidity ^0.5.0;

import "openzeppelin-solidity/contracts/token/ERC20/ERC20Mintable.sol";
import './Math.sol';

contract ConvictionVoting {

    uint256 public TIME_UNIT = 1;
    uint256 public PADD = 10;
    uint256 public CONV_ALPHA = 9 * PADD;
    uint256 public weight = 5;
    uint256 public max_funded = 8;  // from 10
    uint256 proposal_counter = 1;
    ERC20Mintable public token;

    mapping(uint256 => Proposal) public proposals;
    mapping(address => uint256) public stakes_per_voter;

    struct Proposal {
        uint256 amount_commons;
        uint256 external_id;  // github issue id
        uint256 staked_tokens;
        uint256 sent_ether;
        uint256 conviction_last;
        uint256 block_last;
        uint256 starting_block;
        uint256 y0;
        mapping(address => uint256) stakes_per_voter;
    }

    event ProposalAdded(uint256 id);
    event Staked(uint256 id, address voter, uint256 staked_tokens, uint256 conviction, uint256 block);
    event Withdrawn(uint256 id, address voter, uint256 staked_tokens, uint256 conviction);
    event ProposalPassed(uint256 id, uint256 conviction);

    function () payable external {}

    // Aragon roles
    bytes32 constant public VOTER_ROLE = keccak256("VOTER_ROLE");

    constructor(address viction_token) public {
        token = ERC20Mintable(viction_token);
    }

    function addProposal(
        uint256 _amount_commons,
        uint256 _external_id
    ) external {
        proposals[proposal_counter] = Proposal(
            _amount_commons,
            _external_id,
            0,
            0,
            0,
            0,
            0,
            0
        );
        emit ProposalAdded(proposal_counter);
        proposal_counter++;
    }

    function getProposal (uint256 id) view public returns (
        uint256,
        uint256,
        uint256,
        uint256,
        uint256,
        uint256
    ) {
        Proposal storage proposal = proposals[id];
        return (
            proposal.amount_commons,
            proposal.external_id,
            proposal.staked_tokens,
            proposal.sent_ether,
            proposal.conviction_last,
            proposal.block_last
        );
    }

    function getProposalVoterStake(uint256 id, address voter) view public returns (uint256) {
        return proposals[id].stakes_per_voter[voter];
    }

    function stakeToProposal(uint256 id, uint256 amount) external {
        // make sure user does not stake more than he has
        require(stakes_per_voter[msg.sender] + amount < token.balanceOf(msg.sender));
        stakes_per_voter[msg.sender] += amount;

        Proposal storage proposal = proposals[id];

        proposal.stakes_per_voter[msg.sender] += amount;
        proposal.staked_tokens += amount;
        if (proposal.starting_block == 0) {
          proposal.starting_block = block.number;
        }
        proposal.y0 = proposal.conviction_last;

        calculateAndSetConviction(id);
        emit Staked(id, msg.sender, proposal.staked_tokens, proposal.conviction_last, proposal.block_last);
    }

    function withdrawFromProposal(uint256 id, uint256 amount) external {
        Proposal storage proposal = proposals[id];
        require(proposal.stakes_per_voter[msg.sender] >= amount);

        proposal.staked_tokens -= amount;
        stakes_per_voter[msg.sender] -= amount;

        calculateAndSetConviction(id);
        emit Withdrawn(id, msg.sender, proposal.staked_tokens, proposal.conviction_last);
    }

    function calculateAndSetConviction(uint256 id) internal {
        Proposal storage proposal = proposals[id];

        proposal.block_last = block.number;
        uint256 conviction = calculateConviction(proposal);

        proposal.conviction_last = conviction;
        if (conviction > calculateThreshold(proposal.amount_commons)) {
            emit ProposalPassed(id, conviction);
        }
    }

    function calculateConviction(Proposal memory proposal) internal  returns (uint256 conviction) {
        uint D = 10;
        uint aD = 9;
        uint y0 = proposal.y0;
        uint t = block.number - proposal.starting_block; // time increment assuming first block is time 0
        uint x = proposal.staked_tokens;
        uint Dt = D ** t;
        uint aDt = aD ** t;

        conviction = (aDt * y0 + (x*D*(Dt-aDt))/(D-aD)) / Dt;
    }

    function calculateThreshold(uint256 amount_commons) pure public returns (uint256 threshold) {
        return 50; //* (10 ** 18) + amount_commons;
        // - wS*log(β-r)
        // uint256 total_commons = address(this).balance;
        // threshold = weight * token.totalSupply();

        /* emit Log(weight, token.totalSupply(), max_funded, amount_commons, total_commons, log2(PADD) -
        log2(
            max_funded -
            (amount_commons * PADD / total_commons)
        ));

        // we multiply with PADD both max_funded  and r
        threshold *= (
            log2(PADD) -
            log2(
                max_funded -
                (amount_commons * PADD / total_commons)
            )
        ); */
        // return threshold;
    }

    function log2(uint256 x) pure public returns (uint256 y) {
        assembly {
            let arg := x
            x := sub(x,1)
            x := or(x, div(x, 0x02))
            x := or(x, div(x, 0x04))
            x := or(x, div(x, 0x10))
            x := or(x, div(x, 0x100))
            x := or(x, div(x, 0x10000))
            x := or(x, div(x, 0x100000000))
            x := or(x, div(x, 0x10000000000000000))
            x := or(x, div(x, 0x100000000000000000000000000000000))
            x := add(x, 1)
            let m := mload(0x40)
            mstore(m,           0xf8f9cbfae6cc78fbefe7cdc3a1793dfcf4f0e8bbd8cec470b6a28a7a5a3e1efd)
            mstore(add(m,0x20), 0xf5ecf1b3e9debc68e1d9cfabc5997135bfb7a7a3938b7b606b5b4b3f2f1f0ffe)
            mstore(add(m,0x40), 0xf6e4ed9ff2d6b458eadcdf97bd91692de2d4da8fd2d0ac50c6ae9a8272523616)
            mstore(add(m,0x60), 0xc8c0b887b0a8a4489c948c7f847c6125746c645c544c444038302820181008ff)
            mstore(add(m,0x80), 0xf7cae577eec2a03cf3bad76fb589591debb2dd67e0aa9834bea6925f6a4a2e0e)
            mstore(add(m,0xa0), 0xe39ed557db96902cd38ed14fad815115c786af479b7e83247363534337271707)
            mstore(add(m,0xc0), 0xc976c13bb96e881cb166a933a55e490d9d56952b8d4e801485467d2362422606)
            mstore(add(m,0xe0), 0x753a6d1b65325d0c552a4d1345224105391a310b29122104190a110309020100)
            mstore(0x40, add(m, 0x100))
            let magic := 0x818283848586878898a8b8c8d8e8f929395969799a9b9d9e9faaeb6bedeeff
            let shift := 0x100000000000000000000000000000000000000000000000000000000000000
            let a := div(mul(x, magic), shift)
            y := div(mload(add(m,sub(255,a))), shift)
            y := add(y, mul(256, gt(arg, 0x8000000000000000000000000000000000000000000000000000000000000000)))
        }
    }
}
