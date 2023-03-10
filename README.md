# Aera Protocol

[![Unit Tests](https://github.com/GauntletNetworks/aera-contracts/actions/workflows/unit.yml/badge.svg)](https://github.com/GauntletNetworks/aera-contracts/actions/workflows/unit.yml)

Tools used:

- [Hardhat](https://github.com/nomiclabs/hardhat): compile and run the smart contracts on a local development network
- [TypeChain](https://github.com/ethereum-ts/TypeChain): generate TypeScript types for smart contracts
- [Ethers](https://github.com/ethers-io/ethers.js/): renowned Ethereum library and wallet implementation
- [Waffle](https://github.com/EthWorks/Waffle): tooling for writing comprehensive smart contract tests
- [Slither](https://github.com/crytic/slither): solidity analyzer
- [Solhint](https://github.com/protofire/solhint): linter
- [Solcover](https://github.com/sc-forks/solidity-coverage): code coverage
- [Prettier Plugin Solidity](https://github.com/prettier-solidity/prettier-plugin-solidity): code formatter

## Usage

### Pre Requisites

Before running any command, make sure to install dependencies:

```sh
$ yarn install
```

After that, copy the example environment file into an `.env` file like so:

```sh
$ cp .env.example .env
```

Team secrets are managed in [GCP secret manager](https://console.cloud.google.com/security/secret-manager?project=gauntlet-sim). If you don't have access, you need to be added to engineering@gauntlet.network

### Compile

Compile the smart contracts with Hardhat:

```sh
$ yarn compile
```

### TypeChain

Compile the smart contracts and generate TypeChain artifacts. Note that you should only run one of these, depending on which set of contracts you want to deploy or test (each runs `yarn clean` beforehand)

```sh
$ yarn typechain
$ yarn typechain-v1
$ yarn typechain-v2
$ yarn typechain-v4
```

### Analyze Solidity

Analyze the Solidity code:

```sh
$ yarn slither
```

### Lint Solidity

Lint the Solidity code:

```sh
$ yarn lint:sol
```

### Lint TypeScript

Lint the TypeScript code:

```sh
$ yarn lint:ts
```

### Test

Run the Mocha tests:

```sh
$ yarn test
```

Tests run against hardhat forks of target environments (ie Kovan, Mainnet) and require a node provider to be authenticated in your [.env](./.env).

Gotchas:
First run `yarn typechain-v1`. Currently the tests are only setup to run against v1

When running integration tests, if you see an error like `Errors: Invalid value undefined supplied to : RpcTransactionReceipt | null/to: ADDRESS | null`, you probably need to clean your generated deployments folder. This indicates that you have existing deployments to the network you're running your integration test against (a forked copy), and for some reason the test suite doesn't like that.

### Coverage

Generate the code coverage report with env variables:

```sh
$ yarn coverage
```

Generate the code coverage report on local with hardhat fork:

```sh
$ yarn coverage:local
```

### Report Gas

See the gas usage per unit test and average gas per method call:

```sh
$ REPORT_GAS=true yarn test
```

### Clean

Delete the smart contract artifacts, the coverage reports and the Hardhat cache:

```sh
$ yarn clean
```

### Deploy

Prior to deployment, make sure you have provided Infura keys by setting `INFURA_API_KEY` in your environment. Alchemy keys are only used for forking at the moment.

Deploy the Validator to a specific network:

```sh
$ yarn deploy:validator --network <NETWORK> --count <TOKEN_COUNT>
```

Deploy the ManagedPoolFactory to a specific network:

```sh
$ yarn deploy:managedPoolFactory --network <NETWORK>
```

Deploy the GuardianWhitelistFactory to a specific network:

```sh
$ yarn deploy:guardianWhitelistFactory --network <NETWORK>
```

Deploy the GuardianWhitelist to a specific network:
NOTE: Currently broken- GuardianWhiteListFactory is not emitting a Deploy event

```sh
$ yarn deploy:guardianWhitelist --network <NETWORK> --factory <GUARDIAN_WHITELIST_FACTORY> --guardians <GUARDIANS> --salt <SALT>
```

```sh
$ yarn deploy:vault --network <NETWORK> --factory <FACTORY> --name <NAME> --symbol <SYMBOL> --tokens <TOKENS> --weights <WEIGHTS> --swap-fee <FEE> --guardian <GUARDIAN> --validator <VALIDATOR> --notice-period <NOTICE_PERIOD> --management-fee <MANAGEMENT_FEE> --description <DESCRIPTION>
```

Deploy the Vault to Kovan Network:

```sh
$ yarn deploy:kovan --factory <FACTORY> --name <NAME> --symbol <SYMBOL> --tokens <TOKENS> --weights <WEIGHTS> --swap-fee <FEE> --guardian <GUARDIAN> --validator <VALIDATOR> --notice-period <NOTICE_PERIOD> --management-fee <MANAGEMENT_FEE> --description <DESCRIPTION>
```

Deploy the Vault to Mainnet Network:

```sh
$ yarn deploy:mainnet --factory <FACTORY> --name <NAME> --symbol <SYMBOL> --tokens <TOKENS> --weights <WEIGHTS> --swap-fee <FEE> --guardian <GUARDIAN> --validator <VALIDATOR> --notice-period <NOTICE_PERIOD> --management-fee <MANAGEMENT_FEE> --description <DESCRIPTION>
```

Deploy the Validator, ManagedPoolFactory and Vault to Hardhat Network:

```sh
$ yarn deploy:validator --count <TOKEN_COUNT>
$ yarn deploy:managedPoolFactory
$ yarn deploy:vault --factory <FACTORY> --name <NAME> --symbol <SYMBOL> --tokens <TOKENS> --weights <WEIGHTS> --swap-fee <FEE> --guardian <GUARDIAN> --validator <VALIDATOR> --notice-period <NOTICE_PERIOD> --management-fee <MANAGEMENT_FEE> --description <DESCRIPTION> --print-transaction-data
```

Example working deployment to local fork of goerli with actual numbers:

```sh
$ yarn HARDHAT_FORK=goerli yarn deploy:vault --network hardhat --factory 0x14c7F6fC66EcA3954894CF54469CF6d7f2076Aa2 --name test --symbol TEST --tokens 0x2f3A40A3db8a7e3D09B0adfEfbCe4f6F81927557,0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6 --weights 100000000000000000,900000000000000000 --swap-fee 1000000000000 --guardian 0x3345261FDae0BC146B2F45484DcCeB4708a3FEC4 --validator 0xFa60a31d9a684795af7E8c2F5E35eC1C5fA5a84B --notice-period 30 --management-fee 100000  --description goerlitestvault
```

Note that deploying the actual vault contract is expensive and its difficult to acquire enough goerli eth to do it

**Legend**:

- GUARDIAN_WHITELIST_FACTORY: GuardianWhitelistFactory address
- GUARDIANS: Initial Guardians addresses (comma-separated)
- SALT: Salt value for GuardianWhitelist deployment (uint256)
- FACTORY: Balancer's Managed Pool Factory address
- TOKEN_COUNT: Token Count (uint256)
- NAME: Pool token name (string)
- SYMBOL: Pool token symbol (string)
- TOKENS: Tokens' addresses (comma-separated)
- Weights: Tokens' weights (comma-separated uint256)
- FEE: Swap fee percentage (uint256, in 1e18 decimals)
- GUARDIAN: Guardian's address
- VALIDATOR: Address of withdrawal validator contract
- NOTICE_PERIOD: Finalization notice period in seconds (uint256)
- MANAGEMENT_FEE: Management fee earned proportion per second (uint256, in 1e18 decimals)
- DESCRIPTION: Vault text description (string)
- print-transaction-data: Flag to print transaction data for deployment

**Important**:

The deployment address of `GuardianWhitelistFactory` will be changed when:

- `GuardianWhitelistFactory` or `GuardianWhitelist` contracts are updated
- `GuardianWhitelistFactory` initial owner is changed

Also, mainnet address may be different from Hardhat deployed address (because of different gas price/gas limit).

## Syntax Highlighting

If you use VSCode, you can enjoy syntax highlighting for your Solidity code via the
[vscode-solidity](https://github.com/juanfranblanco/vscode-solidity) extension. The recommended approach to set the
compiler version is to add the following fields to your VSCode user settings:

```json
{
  "solidity.compileUsingRemoteVersion": "v0.8.11",
  "solidity.defaultCompiler": "remote"
}
```

Where of course `v0.8.11` can be replaced with any other version.

## Forking a network

Use the same config you used to generate typechains

E.g. for goerli with v1 typechain

```sh
$ yarn hardhat node --fork $GOERLI_API_URL --config hardhat.config.v1.ts
```

# ERRORS

- programmatically run typechain inside solcover.js does not work- i had to run the specific typechain version before running coverage
- coverage-v1 fails with

```
1) Aera Vault V1 Mainnet Deployment
       should be reverted to deploy vault
         when total sum of weights is not one:
     AssertionError: Expected transaction to be reverted with BAL#308, but other exception was thrown: Error: Transaction reverted without a reason string


  2) Aera Vault V1 Mainnet Functionality
       "before each" hook for "should be possible to initialize the vault":
     Error: Transaction reverted without a reason string
```

- yarn coverage:local fails with a compilation error `DeclarationError: Undeclared identifier`

- yarn coverage-v2 fails with

```
1) Aera Vault V2 Mainnet Deployment
       "before all" hook for "should be possible to deploy vault":
     Error: Transaction reverted: function call to a non-contract account
...

 2) Integration Test
       "before each" hook for "when call deposit":
     Error: Transaction reverted: function call to a non-contract account
```
