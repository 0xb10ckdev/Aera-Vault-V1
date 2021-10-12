while [ $# -gt 0 ]; do
  case $1 in
    -t0 | --token0) token0=$2 ;;
    -t1 | --token1) token1=$2 ;;
    -m | --manager) manager=$2 ;;
    -n | --network) network=$2 ;;
  esac
  shift
done
yarn cross-env TOKEN0=$token0 TOKEN1=$token1 MANAGER=$manager hardhat run scripts/deploy.ts --network $network
