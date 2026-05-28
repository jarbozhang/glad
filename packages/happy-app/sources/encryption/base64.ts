const BASE64_CHUNK_SIZE = 0x8000;

function bytesToBinaryString(buffer: Uint8Array): string {
    let binaryString = '';

    for (let offset = 0; offset < buffer.length; offset += BASE64_CHUNK_SIZE) {
        const chunk = buffer.subarray(offset, offset + BASE64_CHUNK_SIZE);
        binaryString += String.fromCharCode(...chunk);
    }

    return binaryString;
}

export function decodeBase64(base64: string, encoding: 'base64' | 'base64url' = 'base64'): Uint8Array {
    let normalizedBase64 = base64;
    
    if (encoding === 'base64url') {
        normalizedBase64 = base64
            .replace(/-/g, '+')
            .replace(/_/g, '/');
        
        const padding = normalizedBase64.length % 4;
        if (padding) {
            normalizedBase64 += '='.repeat(4 - padding);
        }
    }
    
    const binaryString = atob(normalizedBase64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    
    return bytes;
}

export function encodeBase64(buffer: Uint8Array, encoding: 'base64' | 'base64url' = 'base64'): string {
    const binaryString = bytesToBinaryString(buffer);
    const base64 = btoa(binaryString);

    if (encoding === 'base64url') {
        return base64
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }

    return base64;
}
