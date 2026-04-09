declare module "socks-proxy-agent" {
  import { Agent } from "node:http";
  interface SocksProxyAgentOptions {
    timeout?: number;
  }
  export class SocksProxyAgent extends Agent {
    constructor(uri: string, options?: SocksProxyAgentOptions);
  }
}
