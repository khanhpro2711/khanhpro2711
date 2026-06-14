export function normalizeZaloEvent(body) {
  const message = body.message ?? body;
  const sender = message.from ?? body.sender ?? body.user ?? {};
  const chat = message.chat ?? body.chat ?? body.group ?? {};
  return {
    raw: body,
    text: message.text ?? body.text ?? '',
    userId: String(sender.id ?? body.user_id ?? body.uid ?? 'unknown'),
    displayName: sender.name ?? sender.display_name ?? 'Zalo user',
    groupId: chat.type === 'group' || body.group_id ? String(chat.id ?? body.group_id) : null,
    groupName: chat.title ?? chat.name ?? 'Zalo group',
    replyTarget: chat.id ?? sender.id ?? body.user_id,
  };
}

export async function sendZaloMessage(targetId, text) {
  if (!process.env.ZALO_BOT_TOKEN) {
    console.log('[zalo:dry-run]', { targetId, text });
    return { dryRun: true };
  }

  const response = await fetch('https://bot.zapps.me/api/sendMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.ZALO_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ chat_id: targetId, text }),
  });

  if (!response.ok) {
    throw new Error(`Zalo sendMessage failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}
