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

Compile the smart contracts and generate TypeChain artifacts:

```sh
$ yarn typechain
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
$ yarn deploy:factory --network <NETWORK>
```

Deploy the GuardianWhitelistFactory to a specific network:

```sh
$ yarn deploy:guardianWhitelistFactory --network <NETWORK>
```

Deploy the GuardianWhitelist to a specific network:

```sh
$ yarn deploy:guardianWhitelist --network <NETWORK> --factory <GUARDIAN_WHITELIST_FACTORY> --guardians <GUARDIANS> --salt <SALT>
```

Deploy the Vault to a specific network:

```sh
$ yarn deploy:vault --network <NETWORK> --factory <FACTORY> --name <NAME> --symbol <SYMBOL> --tokens <TOKENS> --weights <WEIGHTS> --swapFEE <FEE> --guardian <GUARDIAN> --validator <VALIDATOR> --notice-period <NOTICE_PERIOD> --management-fee <MANAGEMENT_FEE> --description <DESCRIPTION>
```

Deploy the Vault to Kovan Network:

```sh
$ yarn deploy:kovan --factory <FACTORY> --name <NAME> --symbol <SYMBOL> --tokens <TOKENS> --weights <WEIGHTS> --swapFEE <FEE> --guardian <GUARDIAN> --validator <VALIDATOR> --notice-period <NOTICE_PERIOD> --management-fee <MANAGEMENT_FEE> --description <DESCRIPTION>
```

Deploy the Vault to Mainnet Network:

```sh
$ yarn deploy:mainnet --factory <FACTORY> --name <NAME> --symbol <SYMBOL> --tokens <TOKENS> --weights <WEIGHTS> --swapFEE <FEE> --guardian <GUARDIAN> --validator <VALIDATOR> --notice-period <NOTICE_PERIOD> --management-fee <MANAGEMENT_FEE> --description <DESCRIPTION>
```

Deploy the Validator, ManagedPoolFactory and Vault to Hardhat Network:

```sh
$ yarn deploy:validator --count <TOKEN_COUNT>
$ yarn deploy:factory
$ yarn deploy --factory <FACTORY> --name <NAME> --symbol <SYMBOL> --tokens <TOKENS> --weights <WEIGHTS> --swapFEE <FEE> --guardian <GUARDIAN> --validator <VALIDATOR> --notice-period <NOTICE_PERIOD> --management-fee <MANAGEMENT_FEE> --description <DESCRIPTION> --print-transaction-data
```

**Legend**:

- GUARDIAN_WHITELIST_FACTORY: GuardianWhitelistFactory address
- GUARDIANS: Initial Guardians addresses
- SALT: Salt value for GuardianWhitelist deployment
- FACTORY: Balancer's Managed Pool Factory address
- TOKEN_COUNT: Token Count
- NAME: Pool token name
- SYMBOL: Pool token symbol
- TOKENS: Tokens' addresses
- Weights: Tokens' weights
- FEE: Swap fee percentage
- GUARDIAN: Guardian's address
- VALIDATOR: Address of withdrawal validator contract
- NOTICE_PERIOD: Finalization notice period in seconds
- MANAGEMENT_FEE: Management fee earned proportion per second
- DESCRIPTION: Vault text description
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
