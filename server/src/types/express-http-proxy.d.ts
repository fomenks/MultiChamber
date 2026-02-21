declare module 'express-http-proxy' {
  import { Request, Response, NextFunction, RequestHandler } from 'express';

  interface ProxyOptions {
    proxyReqPathResolver?: (req: Request) => string | Promise<string>;
    proxyReqOptDecorator?: (proxyReqOpts: any, srcReq: Request) => any | Promise<any>;
    proxyResDecorator?: (proxyRes: any, proxyResData: any, req: Request, res: Response) => any;
    onError?: (err: Error, req: Request, res: Response) => void;
    [key: string]: any;
  }

  function proxy(host: string, options?: ProxyOptions): RequestHandler;

  export default proxy;
  export { Request };
}
