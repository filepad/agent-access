// Registers this agent's A2A endpoint with Filepad and manages the lifecycle.

import { randomUUID } from 'node:crypto';
import { signRequest } from '../core/auth.js';

export interface EndpointRegistrationConfig {
  baseUrl: string;
  keyId: string;
  secret: string;
  workspaceId: string;
  endpointUrl: string;
  displayName: string;
}

export interface EndpointRegistration {
  registrationId: string;
  displayName: string;
  endpointUrl: string;
  unregister(): Promise<void>;
}

export async function registerEndpoint(
  config: EndpointRegistrationConfig,
): Promise<EndpointRegistration> {
  const baseUrl = config.baseUrl.replace(/\/$/, '');
  const path = '/a2a/register';
  const body = {
    endpointUrl: config.endpointUrl,
    displayName: config.displayName,
  };
  const signed = signRequest(config.keyId, config.secret, 'POST', path, body);

  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: signed.headers,
    body: signed.rawBody,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`A2A registration failed HTTP ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { registrationId: string; displayName: string };

  const unregister = async () => {
    const delPath = `/a2a/register/${encodeURIComponent(data.registrationId)}`;
    const delSigned = signRequest(config.keyId, config.secret, 'DELETE', delPath, undefined);
    await fetch(`${baseUrl}${delPath}`, {
      method: 'DELETE',
      headers: delSigned.headers,
    }).catch(() => {
      // best-effort on shutdown
    });
  };

  process.on('SIGTERM', () => void unregister());
  process.on('SIGINT', () => void unregister());

  return {
    registrationId: data.registrationId,
    displayName: data.displayName,
    endpointUrl: config.endpointUrl,
    unregister,
  };
}
