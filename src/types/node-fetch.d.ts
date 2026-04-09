declare module "node:fetch" {
  export function fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;

  export interface RequestInit {
    method?: string;
    headers?: Record<string, string> | Headers;
    body?: string | Buffer | ReadableStream;
    signal?: AbortSignal;
  }

  export interface Response {
    ok: boolean;
    status: number;
    statusText: string;
    json(): Promise<unknown>;
    text(): Promise<string>;
    arrayBuffer(): Promise<ArrayBuffer>;
  }
}
