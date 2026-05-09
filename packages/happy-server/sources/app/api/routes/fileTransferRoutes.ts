import { z } from "zod";
import { type Fastify } from "../types";
import { s3client, s3bucket, isLocalStorage } from "@/storage/files";
import { randomKeyNaked } from "@/utils/randomKeyNaked";
import { log } from "@/utils/log";

const TRANSFER_PREFIX = "transfers";
const DEFAULT_EXPIRES_SECONDS = 60 * 60;

function ensureTransferStorageConfigured() {
    if (isLocalStorage() || !s3client || !s3bucket) {
        throw new Error("Large file transfer storage is not configured");
    }
}

function transferObjectName(userId: string, transferId: string, fileName: string) {
    const safeName = fileName.replace(/[/\\]/g, "_").slice(0, 160) || "file";
    return `${TRANSFER_PREFIX}/${userId}/${transferId}/${safeName}`;
}

export function fileTransferRoutes(app: Fastify) {
    app.post('/v1/file-transfer/outbound', {
        preHandler: app.authenticate,
        schema: {
            body: z.object({
                fileName: z.string().min(1).max(255),
            }),
            response: {
                200: z.object({
                    transferId: z.string(),
                    uploadUrl: z.string(),
                    downloadUrl: z.string(),
                    objectName: z.string(),
                    expiresAt: z.number(),
                }),
                503: z.object({
                    error: z.literal('Large file transfer storage is not configured'),
                }),
            },
        },
    }, async (request, reply) => {
        try {
            ensureTransferStorageConfigured();
        } catch {
            return reply.code(503).send({ error: 'Large file transfer storage is not configured' });
        }

        const transferId = randomKeyNaked(18);
        const objectName = transferObjectName(request.userId, transferId, request.body.fileName);
        const expiresAt = Date.now() + DEFAULT_EXPIRES_SECONDS * 1000;

        const [uploadUrl, downloadUrl] = await Promise.all([
            s3client.presignedPutObject(s3bucket, objectName, DEFAULT_EXPIRES_SECONDS),
            s3client.presignedGetObject(s3bucket, objectName, DEFAULT_EXPIRES_SECONDS),
        ]);

        return reply.send({
            transferId,
            uploadUrl,
            downloadUrl,
            objectName,
            expiresAt,
        });
    });

    app.post('/v1/file-transfer/inbound', {
        preHandler: app.authenticate,
        schema: {
            body: z.object({
                fileName: z.string().min(1).max(255),
            }),
            response: {
                200: z.object({
                    transferId: z.string(),
                    uploadUrl: z.string(),
                    downloadUrl: z.string(),
                    objectName: z.string(),
                    expiresAt: z.number(),
                }),
                503: z.object({
                    error: z.literal('Large file transfer storage is not configured'),
                }),
            },
        },
    }, async (request, reply) => {
        try {
            ensureTransferStorageConfigured();
        } catch {
            return reply.code(503).send({ error: 'Large file transfer storage is not configured' });
        }

        const transferId = randomKeyNaked(18);
        const objectName = transferObjectName(request.userId, transferId, request.body.fileName);
        const expiresAt = Date.now() + DEFAULT_EXPIRES_SECONDS * 1000;

        const [uploadUrl, downloadUrl] = await Promise.all([
            s3client.presignedPutObject(s3bucket, objectName, DEFAULT_EXPIRES_SECONDS),
            s3client.presignedGetObject(s3bucket, objectName, DEFAULT_EXPIRES_SECONDS),
        ]);

        return reply.send({
            transferId,
            uploadUrl,
            downloadUrl,
            objectName,
            expiresAt,
        });
    });

    app.delete('/v1/file-transfer/:transferId', {
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
            log({ module: 'file-transfer', level: 'warn' }, `Failed to cleanup transfer object: ${error}`);
        }

        return reply.send({ ok: true });
    });
}
