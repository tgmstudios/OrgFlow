const tokenEndpoint = "https://api.elevenlabs.io/v1/convai/conversation/token";

/**
 * Issues an ephemeral WebRTC token for the private ElevenLabs agent.
 * The API key stays on this server; callers must already have passed OrgFlow auth.
 */
export async function elevenLabsVoice(req: Request): Promise<Response | null> {
  if (new URL(req.url).pathname !== "/api/voice/session-token") return null;
  if (req.method !== "GET")
    return Response.json({ error: "Use GET for a voice session token." }, { status: 405 });

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  if (!apiKey || !agentId)
    return Response.json(
      { error: "ElevenLabs voice is not configured." },
      { status: 503 },
    );

  let upstream: Response;
  try {
    upstream = await fetch(
      `${tokenEndpoint}?agent_id=${encodeURIComponent(agentId)}`,
      { headers: { "xi-api-key": apiKey } },
    );
  } catch {
    return Response.json(
      { error: "Unable to reach ElevenLabs. Please retry." },
      { status: 503 },
    );
  }
  const payload = (await upstream.json().catch(() => null)) as
    | { token?: unknown; conversation_id?: unknown }
    | null;
  if (
    !upstream.ok ||
    typeof payload?.token !== "string" ||
    typeof payload.conversation_id !== "string"
  )
    return Response.json(
      { error: "ElevenLabs could not start a voice session. Please retry." },
      { status: 502 },
    );

  return Response.json({
    conversationToken: payload.token,
    conversationId: payload.conversation_id,
    agentId,
  });
}
