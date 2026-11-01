// Peer-to-peer lobby over WebRTC (PeerJS). The host's browser runs the match; guests send inputs and
// render the snapshots the host broadcasts. The lobby code is the host's peer id on the PeerJS
// signalling server, so no game server is needed.
import Peer, { type DataConnection } from 'peerjs';

export const MAX_PLAYERS = 3;
const PREFIX = 'riftclash-v1-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface LobbyPlayer {
  id: string; // peer id ('host' for the host)
  name: string;
  pick: string;
  host: boolean;
}

// Everything that crosses the wire. Guests only send hello/pick/cmd.
export type Msg =
  | { t: 'hello'; name: string; pick: string }
  | { t: 'pick'; pick: string }
  | { t: 'cmd'; cmd: Cmd }
  | { t: 'lobby'; players: LobbyPlayer[]; diff: string }
  | { t: 'start'; you: number }
  | { t: 'snap'; s: unknown }
  | { t: 'full' }
  | { t: 'bye' };

export type Cmd =
  | { c: 'move'; x: number; y: number }
  | { c: 'attack'; id: number }
  | { c: 'cast'; s: number; x: number; y: number }
  | { c: 'flash'; x: number; y: number }
  | { c: 'heal' }
  | { c: 'recall' }
  | { c: 'stop' }
  | { c: 'rank'; s: number }
  | { c: 'buy'; item: string };

export const net = {
  role: 'solo' as 'solo' | 'host' | 'guest',
  code: '',
  peer: null as Peer | null,
  conns: new Map<string, DataConnection>(), // host: guests by peer id
  hostConn: null as DataConnection | null, // guest: link to host
  players: [] as LobbyPlayer[],
  onMsg: (_from: string, _m: Msg) => {},
  onLeave: (_id: string) => {},
  onStatus: (_text: string) => {},
};

const makeCode = () => Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
export const cleanCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);

function wire(conn: DataConnection, from: string) {
  conn.on('data', (d) => net.onMsg(from, d as Msg));
  conn.on('close', () => net.onLeave(from));
  conn.on('error', () => net.onLeave(from));
}

export function hostLobby(): Promise<string> {
  leave();
  return new Promise((resolve, reject) => {
    const tryOpen = (attempt: number) => {
      const code = makeCode();
      const peer = new Peer(PREFIX + code);
      peer.on('open', () => {
        net.role = 'host';
        net.code = code;
        net.peer = peer;
        resolve(code);
      });
      peer.on('connection', (conn) => {
        conn.on('open', () => {
          if (net.conns.size >= MAX_PLAYERS - 1) {
            conn.send({ t: 'full' } satisfies Msg);
            setTimeout(() => conn.close(), 300);
            return;
          }
          net.conns.set(conn.peer, conn);
          wire(conn, conn.peer);
        });
      });
      peer.on('error', (e) => {
        const type = (e as { type?: string }).type;
        if (type === 'unavailable-id' && attempt < 4) {
          peer.destroy();
          tryOpen(attempt + 1);
        } else if (net.role !== 'host') reject(e);
        else net.onStatus(`Connection problem: ${type ?? e.message}`);
      });
      peer.on('disconnected', () => {
        // lost the signalling server; open data channels keep working, but reconnect for new joins
        if (net.role === 'host' && !peer.destroyed) peer.reconnect();
      });
    };
    tryOpen(0);
  });
}

export function joinLobby(code: string, name: string, pick: string): Promise<void> {
  leave();
  return new Promise((resolve, reject) => {
    const peer = new Peer();
    let done = false;
    const fail = (why: string) => {
      if (done) return;
      done = true;
      leave();
      reject(new Error(why));
    };
    const timer = setTimeout(() => fail('No lobby answered that code.'), 12000);
    peer.on('open', () => {
      const conn = peer.connect(PREFIX + code, { reliable: true });
      conn.on('open', () => {
        clearTimeout(timer);
        done = true;
        net.role = 'guest';
        net.code = code;
        net.peer = peer;
        net.hostConn = conn;
        wire(conn, 'host');
        conn.send({ t: 'hello', name, pick } satisfies Msg);
        resolve();
      });
      conn.on('error', () => fail('Could not reach the lobby.'));
    });
    peer.on('error', (e) => {
      const type = (e as { type?: string }).type;
      fail(type === 'peer-unavailable' ? 'No lobby with that code.' : `Connection problem: ${type ?? e.message}`);
    });
  });
}

export function sendToHost(m: Msg) {
  if (net.hostConn?.open) net.hostConn.send(m);
}
export function broadcast(m: Msg) {
  for (const c of net.conns.values()) if (c.open) c.send(m);
}
export function sendTo(id: string, m: Msg) {
  const c = net.conns.get(id);
  if (c?.open) c.send(m);
}
export function dropGuest(id: string) {
  net.conns.get(id)?.close();
  net.conns.delete(id);
}

export function leave() {
  if (net.role === 'guest') sendToHost({ t: 'bye' });
  if (net.role === 'host') broadcast({ t: 'bye' });
  for (const c of net.conns.values()) c.close();
  net.conns.clear();
  net.hostConn?.close();
  net.hostConn = null;
  net.peer?.destroy();
  net.peer = null;
  net.role = 'solo';
  net.code = '';
  net.players = [];
}
