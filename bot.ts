import {
    MatrixClient,
    SimpleFsStorageProvider,
    AutojoinRoomsMixin
} from "matrix-bot-sdk";
import { readFileSync } from "fs";

const homeserverUrl = "ВАШ АДРЕС СЕРВЕРА";
const accessToken = "ТОКЕН";
const ollamaUrl = "http://localhost:11434";
const model = "gemma4:e4b";


const systemPrompt = readFileSync("?????.txt", "utf-8");

const storage = new SimpleFsStorageProvider("bot.json");
const client = new MatrixClient(homeserverUrl, accessToken, storage);
AutojoinRoomsMixin.setupOnClient(client);

function cleanResponse(text: string): string {
    const cleaned = text
        .replace(/\{antml:thinking\}[\s\S]*?\{\/antml:thinking\}/g, '')
        .replace(/\{antml:function_calls\}[\s\S]*?\{\/antml:function_calls\}/g, '')
        .replace(/\{[\/]?antml:[^}]+\}/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    return cleaned.length > 0 ? cleaned : "Извините, не смог сформулировать ответ. Попробуйте переспросить.";
}

async function askOllama(userMessage: string): Promise<string> {
    const response = await fetch(`${ollamaUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model,
            system: systemPrompt,
            prompt: userMessage,
            stream: false
        })
    });

    if (!response.ok) throw new Error(`Ollama error: ${response.status}`);
    const data = await response.json();
    return cleanResponse(data.response as string);
}

client.on("room.message", async (roomId: string, event: any) => {
    if (!event["content"]) return;
    if (event["content"]["msgtype"] !== "m.text") return;

    const botUserId = await client.getUserId();
    if (event["sender"] === botUserId) return;

    const body: string = event["content"]["body"];
    console.log(`${roomId}: ${event["sender"]} says '${body}'`);

    try {
        await client.setTyping(roomId, true, 10000);
        const aiResponse = await askOllama(body);
        await client.setTyping(roomId, false);
        await client.sendMessage(roomId, {
            msgtype: "m.text",
            body: aiResponse
        });
    } catch (err) {
        console.error("Error querying Ollama:", err);
        await client.setTyping(roomId, false);
        await client.sendMessage(roomId, {
            msgtype: "m.text",
            body: "⚠️ Не удалось получить ответ от модели."
        });
    }
});

client.start().then(() => console.log("Client started!"));
