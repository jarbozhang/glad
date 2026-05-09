import { describe, expect, it } from "vitest";
import fastify from "fastify";
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "fastify-type-provider-zod";
import { fileTransferRoutes } from "./fileTransferRoutes";
import { type Fastify } from "../types";

function createApp() {
    const app = fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    const typed = app.withTypeProvider<ZodTypeProvider>() as unknown as Fastify;
    typed.decorate("authenticate", async (request: any) => {
        request.userId = "user-1";
    });
    fileTransferRoutes(typed);
    return app;
}

describe("fileTransferRoutes", () => {
    it("reports unavailable transfer storage when S3 is not configured", async () => {
        const app = createApp();

        const response = await app.inject({
            method: "POST",
            url: "/v1/file-transfer/outbound",
            headers: { authorization: "Bearer test" },
            payload: { fileName: "large.zip" },
        });

        expect(response.statusCode).toBe(503);
        expect(response.json()).toEqual({
            error: "Large file transfer storage is not configured",
        });

        await app.close();
    });
});
