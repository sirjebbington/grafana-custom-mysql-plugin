import { SQLOptions, SQLQuery } from './sql';

export type TokenSource = 'id_token' | 'access_token';

export interface MySQLOptions extends SQLOptions {
  /** Read by Grafana itself: forward the signed-in user's OAuth tokens to the backend. Always true for this plugin. */
  oauthPassThru?: boolean;
  /** Which forwarded IDAM token becomes the StarRocks password. Defaults to id_token. */
  tokenSource?: TokenSource;
  /** Token claim used as the StarRocks username. Defaults to sub. */
  usernameClaim?: string;
  /** Open connections per user for this datasource. Defaults to 5. */
  maxConnsPerUser?: number;
  /** Seconds before an idle connection is closed. Defaults to 60. */
  connMaxIdleSeconds?: number;
  /** Name in the StarRocks TLS certificate, when it differs from the host in the URL. */
  serverName?: string;
  /** Connect without TLS. Sends the token unencrypted; local testing only. */
  allowPlaintext?: boolean;
}

export interface MySQLQuery extends SQLQuery {}
