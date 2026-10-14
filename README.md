<div align="center">

# Cadeau

**Gift USDC like a gift card.**

Single-use gift codes on **Arc** — the sender funds a card, shares a link,
and the recipient claims it with any wallet. No gas, no setup, no second claim.

[![Solidity](https://img.shields.io/badge/Solidity-escrow_contract-black?style=flat&logo=solidity)](https://soliditylang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-gasless_relayer-339933?style=flat&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Arc](https://img.shields.io/badge/Arc-Mainnet-C8DB2F?style=flat)](https://www.arc.io/)
[![USDC](https://img.shields.io/badge/USDC-gift_currency-2775CA?style=flat)](https://www.circle.com/usdc)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

### Start here

| | |
|--|--|
| **Live app** | https://cadeau-gift.vercel.app |
| **The single-use test** | see [below](#the-single-use-test) — a code pays out exactly once, proven in one command |
| **On-chain proof** | see [below](#on-chain-proof-real-transactions) — real, verifiable transactions on Arc, not simulated |
| **Deployed contract** | 0x51484AD17fa82916d96502F47d423093cdd6834A  on https://explorer.arc.io/address/0x51484AD17fa82916d96502F47d423093cdd6834A?tab=contract |
| **Run it yourself** | `node server/index.js` — see [Running locally](#running-locally) |

</div>

---

## What Cadeau is

*Cadeau* is French for "gift." Cadeau turns USDC into something you can hand to
anyone with a link or a code.

- A **card** is a gift held in escrow by a contract on Arc (`Cadeau.sol`).
- A **code** is the secret that unlocks it: `CDEU-XXXX-XXXX-XXXX-XXXX`, created in
  the sender's browser. Only its hash ever touches the chain.
- A **claim** is gasless. The recipient pastes any wallet address, a relayer pays the
  network fee, and the contract pays them the exact amount — once.

The sender pays the gift amount plus a small flat network fee. The recipient needs no
app, no gas, and no prior crypto experience beyond an address (or a free email
sign-up that creates one).

---

## The single-use test

> A gift card that can be claimed twice is not a gift card.

**With the right code:** the contract checks the hash, pays the recipient the exact
amount, and marks the gift redeemed.

**With the same code again, a wrong code, or after a refund:** the contract reverts.
There is no second payout, and no way to guess a code — only a hash is stored on-chain.

```bash
npm install
npx hardhat test
```

The test suite covers the escrow rules directly: create, claim, double-claim, wrong
code, expiry and refund.

---

## On-chain proof (real transactions)

The tests prove the rules locally. The transactions below are the same story against
the deployed contract on Arc mainnet. Every hash is independently checkable on the
explorer.

| Step | What happened | Proof |
|--|--|--|
| 1. Gift created | A real `createGift()` transaction funds a card with USDC in escrow | _(https://explorer.arc.io/tx/0xebfa9583bcd2ab08798141b240e640dd93308a5cb85c0ed852b5ba73526dba16)_ |
| 2. Claimed gaslessly | The relayer calls `claim()`; the recipient receives the exact amount and pays no gas | _(https://explorer.arc.io/tx/0xd3857106dbaec4603a616e2ec5fae745381c19428ad3442c2b8aad4094f08640)_ |
| 3. Second claim blocked | Using the same code again reverts on-chain — the gift is already redeemed | |
| 4. Refund path | After the 30-day window, an unclaimed gift can be reclaimed by the sender |  |

---

## Why Cadeau

Sending crypto to a friend is still awkward. They need a wallet, the right network,
gas tokens, and the courage to paste a long address. Most people give up before they
receive anything.

Cadeau makes the gift feel like a gift:

- **One link.** Share it on WhatsApp, Telegram, X, Instagram or email.
- **No gas for the recipient.** A relayer covers the network fee.
- **A real card.** Each gift gets a designed card with the amount and the code, shown
  on the site, in link previews and in the email.
- **Safe by design.** The code is single-use, stored only as a hash on-chain, and
  unclaimed gifts return to the sender after 30 days.

---

## How it works

1. **Create and fund** — the sender picks an amount and an optional message. The
   browser makes a random code, hashes it with `keccak256`, and sends the USDC plus
   the hash to the contract in one `createGift()` call (after a one-time USDC
   approval).
2. **Share** — the sender gets a claim link (`/g/CODE`) and a card. Six round icons
   share it: WhatsApp, Telegram, X DM, Instagram, copy link and copy code. It can also
   be emailed straight from the form.
3. **Claim** — the recipient opens the link, sees the card and a countdown, and pastes
   a wallet address. The server checks the code against the contract and the relayer
   submits `claim()`, paying the gas.
4. **Refund** — if nobody claims within 30 days, the sender can take the USDC back.

### Features

- **Single gift** and **multiple gifts** — one amount and message for up to 20 cards
  at a time, from a list of emails or a number of codes. One USDC approval, then one
  transaction per gift. Download the codes as a CSV.
- **Sign up with email** — no wallet app needed. A free embedded wallet
  ([thirdweb in-app wallets](https://thirdweb.com/)) gives each person their own
  address from an email code. Existing wallets still work.
- **History** — each wallet sees the gifts it created and whether they were claimed.
- **Live card preview** — the card updates as the sender types.
- **Link previews** — pasting a gift link into WhatsApp or Telegram shows the card.

---

## Try it

Create a gift on the live app, copy the link, and open it in a private window to see
the recipient's side. Or call the server directly:

---

## Architecture

```
┌───────────────────┐        ┌──────────────────────┐        ┌─────────────────┐
│  Browser           │ create │  Cadeau server        │ claim  │  Escrow contract │
│  (site + email     │ gift   │  (Node + Express)     │──────▶ │  On Arc          │
│  sign-up wallet)   │───────▶│  Relayer pays gas,    │        │  Holds the USDC; │
│                    │        │  draws cards, sends   │        │  stores only the │
│  Makes the code,   │        │  email, rate-limits   │        │  code's hash;    │
│  hashes it, funds  │        │                        │        │  pays out once   │
│  the card          │        │                        │        │                  │
└───────────────────┘        └──────────────────────┘        └─────────────────┘
```

```
cadeau/
├── contracts/
│   ├── Tessera.sol            # escrow: createGift(), claim(), refund after expiry
│   └── mocks/MockUSDC.sol      # test USDC for the local test suite
├── deployments/
│   └── arcMainnet.json         # deployed address + ABI used by the server
├── server/
│   ├── index.js                # API, gasless relayer, card pictures, page + link previews
│   ├── email.js                # gift emails sent through Brevo
│   ├── brand.js                # draws the card and link-preview pictures
│   └── fonts/                  # Manrope, used on the card pictures
├── public/
│   ├── site.html               # the single-page app
│   ├── site.css
│   ├── site.js                 # create, claim, history, bulk
│   ├── signup.js               # "Sign up" with email (embedded wallet)
│   ├── brand/                  # logos and the card artwork
│   └── vendor/                 # ethers.js
├── scripts/                    # deploy, create a gift from the terminal, set the fee, balance checks
├── test/
│   └── Tessera.js              # escrow rule tests
├── api/index.js                # Vercel entry point (wraps the server)
├── vercel.json
└── hardhat.config.js
```

- **`contracts/Cadeau.sol`** — holds the USDC for each gift against the hash of its
  code. `claim()` pays the exact amount to the recipient and marks the gift redeemed;
  a second attempt reverts. After expiry the sender can take the funds back.
- **`server/index.js`** — verifies a code against the contract, then submits the claim
  from the relayer wallet so the recipient pays no gas. It also draws the cards, sends
  email, and fills in the link-preview tags for each gift link.
- **`public/site.js` + `signup.js`** — create the code in the browser, fund the card,
  and handle sign-up, claiming, history and bulk gifts.

### Why Arc is load-bearing, not decorative

The escrow is the product. The USDC lives in the deployed contract, not on the server
and not in the email. Even if someone skipped the website entirely and called the
contract directly, `claim()` still reverts without the right code, and a redeemed gift
can never pay out again. Take away Arc and there is nothing holding the money. Arc
also gives fast, cheap USDC settlement, so a gasless claim costs the sender a fraction
of a cent.

---

## Running locally

```bash
git clone https://github.com/PhylippusRex/cadeau.git
cd cadeau
npm install

npx hardhat compile          # compiles the contract
npx hardhat test             # runs the escrow tests
node server/index.js         # starts the app on http://localhost:3001
```

---

## Status

v1.0 — built for the Arc Microgrants hackathon (Circle × DoraHacks).

- Create, share, claim, refund, history, bulk gifts and email delivery all work
  against the live contract on Arc mainnet.
- **Sign up with email** is powered by thirdweb in-app wallets, which are free within
  their usage limits. A new wallet starts empty, so a sender deposits USDC to their new
  address before creating gifts. Recipients do not need an account at all.
- The on-chain contract is still named `Tessera`: the product was renamed to Cadeau
  after the contract was deployed, and a deployed contract's name cannot change.
- Gift history is saved in the browser for each wallet. The blockchain stores only a
  hash of each code, so a lost browser cannot rebuild the list — copy the codes you
  need.
- Link previews show the card with its code, which is the same exposure as the link
  itself. Anyone with the link can claim, so share it privately. A switch in
  `server/index.js` (`SHOW_CODE_IN_PREVIEW`) hides the code from previews.
- Rate limits and the claim queue live in the server's memory. That is fine for a
  hackathon; a production version would move them to a shared store.
- Demo video: added once recorded.

---

## License

MIT — see [LICENSE](./LICENSE).

---

<div align="center">

**Built by [Philippus](https://github.com/PhylippusRex)** for the Arc Microgrants hackathon

</div>
