# Vault deployments

## Polygon
# TODO: since we use managedPoolFactory.deploy(), we don't save to local `deployments` folder. How to get address from that factory programmatically?
```
yarn hardhat --network polygon deploy:vault --factory 0x008f0831b55553381aB981B8f535B80d1F9BF822  --name test --symbol TEST --tokens 0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619,0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063  --weights 100000000000000000,900000000000000000 --swap-fee 1000000000000 --guardian 0x3345261FDae0BC146B2F45484DcCeB4708a3FEC4 --validator 0x3154Eb27b58DFA3800EF439eDFccBd5ca1A7E959  --notice-period 30 --management-fee 100000  --description polygontestvault --config hardhat.config.v1.ts --gas-price 70000000000
```
0xcab857e779FD303CF3a68A17fb70771aBc4fa570
