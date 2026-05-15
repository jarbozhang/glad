import fastify from "fastify";
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "fastify-type-provider-zod";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Fastify } from "../types";

const {
    state,
    filesMock,
    resetState,
} = vi.hoisted(() => {
    const state = {
        useLocalStorage: false,
        putUrl: "https://oss.test/upload-url",
        getUrl: "https://oss.test/download-url",
        removed: [] as string[],
    };

    const resetState = () => {
        state.useLocalStorage = false;
        state.removed = [];
    };

    const filesMock = {
        s3client: {
            presignedPutObject: vi.fn(async (_bucket: string, _object: string, _ttl: number) => state.putUrl),
            presignedGetObject: vi.fn(async (_bucket: string, _object: string, _ttl: number) => state.getUrl),
            removeObject: vi.fn(async (_bucket: string, objectName: string) => {
                state.removed.push(objectName);
            }),
        },
        s3bucket: "test-bucket",
        isLocalStorage: vi.fn(() => state.useLocalStorage),
    };

    return { state, filesMock, resetState };
});

vi.mock("@/storage/files", () => filesMock);
vi.mock("@/utils/randomKeyNaked", () => ({ randomKeyNaked: () => "transfer123" }));
vi.mock("@/utils/log", () => ({ log: vi.fn() }));

import { fileTransferRoutes } from "./fileTransferRoutes";

async function createApp() {
    const app = fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    const typed = app.withTypeProvider<ZodTypeProvider>() as unknown as Fastify;

    typed.decorate("authenticate", async (request: any, reply: any) => {
        const userId = request.headers["x-user-id"];
        if (typeof userId !== "string") {
            return reply.code(401).send({ error: "Unauthorized" });
        }
        request.userId = userId;
    });

    fileTransferRoutes(typed);
    await typed.ready();
    return typed;
}

describe("fileTransferRoutes", () => {
    let app: Fastify;

    beforeEach(() => {
        resetState();
        vi.clearAllMocks();
    });

    afterEach(async () => {
        if (app) await app.close();
    });

    it("creates inbound transfer leases backed by S3-compatible storage", async () => {
        app = await createApp();

        const res = await app.inject({
            method: "POST",
            url: "/v1/file-transfer/inbound",
            headers: { "x-user-id": "u1" },
            payload: { fileName: "report.html" },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual(expect.objectContaining({
            transferId: "transfer123",
            uploadUrl: state.putUrl,
            downloadUrl: state.getUrl,
            objectName: "transfers/u1/transfer123/report.html",
        }));
        expect(filesMock.s3client.presignedPutObject).toHaveBeenCalledWith("test-bucket", "transfers/u1/transfer123/report.html", 3600);
        expect(filesMock.s3client.presignedGetObject).toHaveBeenCalledWith("test-bucket", "transfers/u1/transfer123/report.html", 3600);
    });

    it("creates outbound transfer leases and sanitizes file names", async () => {
        app = await createApp();

        const res = await app.inject({
            method: "POST",
            url: "/v1/file-transfer/outbound",
            headers: { "x-user-id": "u1" },
            payload: { fileName: "../nested\\report.pdf" },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json().objectName).toBe("transfers/u1/transfer123/.._nested_report.pdf");
    });

    it("returns 503 when transfer storage is not configured", async () => {
        state.useLocalStorage = true;
        app = await createApp();

        const res = await app.inject({
            method: "POST",
            url: "/v1/file-transfer/inbound",
            headers: { "x-user-id": "u1" },
            payload: { fileName: "report.html" },
        });

        expect(res.statusCode).toBe(503);
        expect(res.json()).toEqual({ error: "Large file transfer storage is not configured" });
    });

    it("cleans up objects owned by the requesting user and transfer", async () => {
        app = await createApp();

        const res = await app.inject({
            method: "DELETE",
            url: "/v1/file-transfer/transfer123",
            headers: { "x-user-id": "u1" },
            payload: { objectName: "transfers/u1/transfer123/report.html" },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ ok: true });
        expect(filesMock.s3client.removeObject).toHaveBeenCalledWith("test-bucket", "transfers/u1/transfer123/report.html");
    });

    it("ignores cleanup attempts outside the requesting user's transfer prefix", async () => {
        app = await createApp();

        const res = await app.inject({
            method: "DELETE",
            url: "/v1/file-transfer/transfer123",
            headers: { "x-user-id": "u1" },
            payload: { objectName: "transfers/u2/transfer123/report.html" },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ ok: true });
        expect(filesMock.s3client.removeObject).not.toHaveBeenCalled();
    });
});
