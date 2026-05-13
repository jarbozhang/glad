import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import { decodeBase64, encodeBase64 } from './base64';

const originalAtob = globalThis.atob;
const originalBtoa = globalThis.btoa;

function makeBytes(size: number): Uint8Array {
    const bytes = new Uint8Array(size);

    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = i % 256;
    }

    return bytes;
}

describe('base64 encoding', () => {
    beforeAll(() => {
        vi.stubGlobal('atob', (value: string) => Buffer.from(value, 'base64').toString('binary'));
        vi.stubGlobal('btoa', (value: string) => Buffer.from(value, 'binary').toString('base64'));
    });

    afterAll(() => {
        vi.stubGlobal('atob', originalAtob);
        vi.stubGlobal('btoa', originalBtoa);
    });

    it('encodes buffers larger than the JavaScript argument stack limit', () => {
        const bytes = makeBytes(256 * 1024);

        const encoded = encodeBase64(bytes);

        expect(decodeBase64(encoded)).toEqual(bytes);
    });

    it('encodes large buffers as base64url without padding or unsafe URL characters', () => {
        const bytes = makeBytes(256 * 1024 + 1);

        const encoded = encodeBase64(bytes, 'base64url');

        expect(encoded).not.toContain('+');
        expect(encoded).not.toContain('/');
        expect(encoded).not.toContain('=');
        expect(decodeBase64(encoded, 'base64url')).toEqual(bytes);
    });
});
