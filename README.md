# Mammon Protocol

Tools used:

- [Hardhat](https://github.com/nomiclabs/hardhat): compile and run the smart contracts on a local development network
- [TypeChain](https://github.com/ethereum-ts/TypeChain): generate TypeScript types for smart contracts
- [Ethers](https://github.com/ethers-io/ethers.js/): renowned Ethereum library and wallet implementation
- [Waffle](https://github.com/EthWorks/Waffle): tooling for writing comprehensive smart contract tests
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

Deploy the Validator to a specific network:

```sh
$ yarn deploy:validator --network <NETWORK>
```

Deploy the Vault to a specific network:

```sh
$ yarn deploy:vault --network <NETWORK> --token0 <TOKEN0> --token1 <TOKEN1> --manager <MANAGER> --validator <VALIDATOR> --notice-period <NOTICE_PERIOD>
```

Deploy the Vault to Kovan Network:

```sh
$ yarn deploy:kovan --token0 <TOKEN0> --token1 <TOKEN1> --manager <MANAGER> --validator <VALIDATOR> --notice-period <NOTICE_PERIOD>
```

Deploy the Vault to Mainnet Network:

```sh
$ yarn deploy:mainnet --token0 <TOKEN0> --token1 <TOKEN1> --manager <MANAGER> --validator <VALIDATOR> --notice-period <NOTICE_PERIOD>
```

Deploy the Validator and Vault to Hardhat Network:

```sh
$ yarn deploy --token0 <TOKEN0> --token1 <TOKEN1> --manager <MANAGER> --validator <VALIDATOR> --notice-period <NOTICE_PERIOD>
```

TOKEN0: Token0's address
TOKEN1: Token1's address
MANAGER: Manager's address
VALIDATOR: Validator's address
NOTICEPERIOD: Notice Period in second

## Syntax Highlighting

If you use VSCode, you can enjoy syntax highlighting for your Solidity code via the
[vscode-solidity](https://github.com/juanfranblanco/vscode-solidity) extension. The recommended approach to set the
compiler version is to add the following fields to your VSCode user settings:

```json
{
  "solidity.compileUsingRemoteVersion": "v0.8.4+commit.c7e474f2",
  "solidity.defaultCompiler": "remote"
}
```

Where of course `v0.8.4+commit.c7e474f2` can be replaced with any other version.
