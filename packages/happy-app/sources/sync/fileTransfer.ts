import { apiSocket } from './apiSocket';

export interface FileTransferLease {
    transferId: string;
    uploadUrl: string;
    downloadUrl: string;
    objectName: string;
    expiresAt: number;
}

async function requestJson<T>(path: string, init: RequestInit): Promise<T> {
    const response = await apiSocket.request(path, {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            ...(init.headers || {}),
        },
    });

    if (!response.ok) {
        let detail = response.statusText;
        try {
            const body = await response.json();
            if (body && typeof body.error === 'string') {
                detail = body.error;
            }
        } catch {
            // Keep the HTTP status text for non-JSON responses.
        }
        throw new Error(detail || `HTTP ${response.status}`);
    }

    return await response.json() as T;
}

export async function createInboundFileTransfer(fileName: string): Promise<FileTransferLease> {
    return requestJson<FileTransferLease>('/v1/file-transfer/inbound', {
        method: 'POST',
        body: JSON.stringify({ fileName }),
    });
}

export async function createOutboundFileTransfer(fileName: string): Promise<FileTransferLease> {
    return requestJson<FileTransferLease>('/v1/file-transfer/outbound', {
        method: 'POST',
        body: JSON.stringify({ fileName }),
    });
}

export async function cleanupFileTransfer(transfer: Pick<FileTransferLease, 'transferId' | 'objectName'>): Promise<void> {
    await requestJson<{ ok: true }>(`/v1/file-transfer/${encodeURIComponent(transfer.transferId)}`, {
        method: 'DELETE',
        body: JSON.stringify({ objectName: transfer.objectName }),
    });
}
