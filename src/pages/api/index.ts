import type { APIRoute } from "astro"
import {
  createParser,
  ParsedEvent,
  ReconnectInterval
} from "eventsource-parser"

const apiKeys = (
  import.meta.env.OPENAI_API_KEY ||
  process.env.OPENAI_API_KEY ||
  ""
)
  .split(/\s*\|\s*/)
  .filter(Boolean)

const baseURL = (
  import.meta.env.OPENAI_API_BASE_URL ||
  process.env.OPENAI_API_BASE_URL ||
  "api.openai.com"
).replace(/^https?:\/\//, "")

const pwd = import.meta.env.PASSWORD || process.env.PASSWORD

export const post: APIRoute = async context => {
  const body = await context.request.json()
  const apiKey = apiKeys.length
    ? apiKeys[Math.floor(Math.random() * apiKeys.length)]
    : ""
  let { messages, key = apiKey, temperature = 0.6, password } = body

  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  if (!key.startsWith("sk-")) key = apiKey
  if (!key) {
    return new Response("没有填写 OpenAI API key")
  }
  if (!messages) {
    return new Response("没有输入任何文字")
  }
  if (pwd && pwd !== password) {
    return new Response("密码错误，请联系网站管理员")
  }

  const completion = await fetch(`https://${baseURL}/v1/chat/completions`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`
    },
    method: "POST",
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      messages,
      temperature,
      stream: true
    })
  })

  const stream = new ReadableStream({
    async start(controller) {
      const streamParser = (event: ParsedEvent | ReconnectInterval) => {
        if (event.type === "event") {
          const data = event.data
          if (data === "[DONE]") {
            controller.close()
            return
          }
          try {
            const json = JSON.parse(data)
            const text = json.choices[0].delta?.content
            const queue = encoder.encode(text)
            controller.enqueue(queue)
          } catch (e) {
            controller.error(e)
          }
        }
      }
      const parser = createParser(streamParser)
      for await (const chunk of completion.body as any) {
        parser.feed(decoder.decode(chunk))
      }
    }
  })

  return new Response(stream)
}
