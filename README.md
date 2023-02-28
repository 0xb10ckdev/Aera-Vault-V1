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

Compile the smart contracts and generate TypeChain artifacts. Note that you should only run one of these, depending on which set of contracts you want to deploy or test, running `yarn clean` before switching between different versions

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
NOTE: I had to use --config hardhat.config.v1.ts

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
$ yarn deploy --factory <FACTORY> --name <NAME> --symbol <SYMBOL> --tokens <TOKENS> --weights <WEIGHTS> --swap-fee <FEE> --guardian <GUARDIAN> --validator <VALIDATOR> --notice-period <NOTICE_PERIOD> --management-fee <MANAGEMENT_FEE> --description <DESCRIPTION> --print-transaction-data
```

Example working deployment to goerli with actual numbers:

```sh
$ yarn hardhat --network goerli deploy:vault --factory 0x14c7F6fC66EcA3954894CF54469CF6d7f2076Aa2 --name test --symbol TEST --tokens 0x2f3A40A3db8a7e3D09B0adfEfbCe4f6F81927557,0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6 --weights 100000000000000000,900000000000000000 --swap-fee 1000000000000 --guardian 0xA3b78855D8de9846ABD478a47b81579d1651deA8 --validator 0xFa60a31d9a684795af7E8c2F5E35eC1C5fA5a84B --notice-period 30 --management-fee 1000000000000 --description goerlitestvault
```
>>>

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


## Forking a network

Use the same config you used to generate typechains

E.g. for goerli with v1 typechain
```sh
$ yarn hardhat node --fork $GOERLI_API_URL --config hardhat.config.v1.ts
```

# ERRORS
yarn coverage-v1 works except for:
```
1) Aera Vault V1 Mainnet Functionality
       when Vault is initialized
         when depositing to Vault
           should be possible to deposit tokens
             when depositing tokens:
     Error: VM Exception while processing transaction: reverted with reason string 'BAL#302'
     ```

yarn test:unit and yarn test:goerli both fail with:

```
An unexpected error occurred:

MalformedAbiError: Not a valid ABI
    at Object.extractAbi (/Users/ben/Gauntlet/aera-contracts/node_modules/typechain/src/parser/abiParser.ts:309:9)
    at /Users/ben/Gauntlet/aera-contracts/node_modules/typechain/src/typechain/io.ts:45:21
    at Array.filter (<anonymous>)
    at Object.skipEmptyAbis (/Users/ben/Gauntlet/aera-contracts/node_modules/typechain/src/typechain/io.ts:45:6)
    at Object.runTypeChain (/Users/ben/Gauntlet/aera-contracts/node_modules/typechain/src/typechain/runTypeChain.ts:20:15)
    at SimpleTaskDefinition.action (/Users/ben/Gauntlet/aera-contracts/node_modules/@typechain/hardhat/src/index.ts:67:26)
    at Environment._runTaskDefinition (/Users/ben/Gauntlet/aera-contracts/node_modules/hardhat/src/internal/core/runtime-environment.ts:217:35)
    at Environment.run (/Users/ben/Gauntlet/aera-contracts/node_modules/hardhat/src/internal/core/runtime-environment.ts:129:25)
    at OverriddenTaskDefinition._action (/Users/ben/Gauntlet/aera-contracts/node_modules/@typechain/hardhat/src/index.ts:31:11)
    at async Environment._runTaskDefinition (/Users/ben/Gauntlet/aera-contracts/node_modules/hardhat/src/internal/core/runtime-environment.ts:217:14)
    ```



    Everything requires running with the specific version number, e.g. yarn typechain-v1 as opposed to yarn typechain, or in general passing in the hardhat config `yarn hardhat node --config hardhat.config.v1.ts`


