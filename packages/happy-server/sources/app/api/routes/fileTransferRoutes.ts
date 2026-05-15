import { z } from "zod";
import { type Fastify } from "../types";
import { isLocalStorage, s3bucket, s3client } from "@/storage/files";
import { randomKeyNaked } from "@/utils/randomKeyNaked";
import { log } from "@/utils/log";

const TRANSFER_PREFIX = "transfers";
const DEFAULT_EXPIRES_SECONDS = 60 * 60;
const STORAGE_NOT_CONFIGURED = "Large file transfer storage is not configured";

function ensureTransferStorageConfigured() {
    if (isLocalStorage() || !s3client || !s3bucket) {
        throw new Error(STORAGE_NOT_CONFIGURED);
    }
}

function safeTransferFileName(fileName: string) {
    return fileName.replace(/[/\\]/g, "_").slice(0, 160) || "file";
}

function transferObjectName(userId: string, transferId: string, fileName: string) {
    return `${TRANSFER_PREFIX}/${userId}/${transferId}/${safeTransferFileName(fileName)}`;
}

async function createTransferLease(userId: string, fileName: string) {
    ensureTransferStorageConfigured();

    const transferId = randomKeyNaked(18);
    const objectName = transferObjectName(userId, transferId, fileName);
    const expiresAt = Date.now() + DEFAULT_EXPIRES_SECONDS * 1000;

    const [uploadUrl, downloadUrl] = await Promise.all([
        s3client.presignedPutObject(s3bucket, objectName, DEFAULT_EXPIRES_SECONDS),
        s3client.presignedGetObject(s3bucket, objectName, DEFAULT_EXPIRES_SECONDS),
    ]);

    return {
        transferId,
        uploadUrl,
        downloadUrl,
        objectName,
        expiresAt,
    };
}

export function fileTransferRoutes(app: Fastify) {
    const createBody = z.object({
        fileName: z.string().min(1).max(255),
    });

    const transferResponse = z.object({
        transferId: z.string(),
        uploadUrl: z.string(),
        downloadUrl: z.string(),
        objectName: z.string(),
        expiresAt: z.number(),
    });

    const unavailableResponse = z.object({
        error: z.literal(STORAGE_NOT_CONFIGURED),
    });

    async function handleCreate(request: { userId: string; body: z.infer<typeof createBody> }, reply: any) {
        try {
            return reply.send(await createTransferLease(request.userId, request.body.fileName));
        } catch (error) {
            if (error instanceof Error && error.message === STORAGE_NOT_CONFIGURED) {
                return reply.code(503).send({ error: STORAGE_NOT_CONFIGURED });
            }
            throw error;
        }
    }

    app.post("/v1/file-transfer/inbound", {
        preHandler: app.authenticate,
        schema: {
            body: createBody,
            response: {
                200: transferResponse,
                503: unavailableResponse,
            },
        },
    }, handleCreate);

    app.post("/v1/file-transfer/outbound", {
        preHandler: app.authenticate,
        schema: {
            body: createBody,
            response: {
                200: transferResponse,
                503: unavailableResponse,
            },
        },
    }, handleCreate);

    app.delete("/v1/file-transfer/:transferId", {
        preHandler: app.authenticate,
        schema: {
            params: z.object({
                transferId: z.string().min(1),
            }),
            body: z.object({
                objectName: z.string().min(1),
            }),
            response: {
                200: z.object({
                    ok: z.literal(true),
                }),
            },
        },
    }, async (request, reply) => {
        if (isLocalStorage() || !s3client || !s3bucket) {
            return reply.send({ ok: true });
        }

        const expectedPrefix = `${TRANSFER_PREFIX}/${request.userId}/${request.params.transferId}/`;
        if (!request.body.objectName.startsWith(expectedPrefix)) {
            return reply.send({ ok: true });
        }

        try {
            await s3client.removeObject(s3bucket, request.body.objectName);
        } catch (error) {
            log({ module: "file-transfer", level: "warn" }, `Failed to cleanup transfer object: ${error}`);
        }

        return reply.send({ ok: true });
    });
}
