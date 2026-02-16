export async function sendTelegramMessage({ botToken, chatId, text }) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true
    })
  });

  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(`Telegram send failed: ${JSON.stringify(data)}`);
  }
  return data;
}
