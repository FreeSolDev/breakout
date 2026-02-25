// Fetches SOL price + 24h change from Jupiter Price API V3
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const API_KEY = '0729bdf4-4a47-44aa-8772-d842d023bc1b';
const POLL_INTERVAL = 60_000; // refresh every 60s

export const solPrice = {
  usd: 0,
  change24h: 0,
  loaded: false,
  _timer: 0,
};

export async function fetchSolPrice() {
  try {
    const res = await fetch(
      `https://api.jup.ag/price/v3?ids=${SOL_MINT}`,
      { headers: { 'x-api-key': API_KEY } }
    );
    const data = await res.json();
    const info = data[SOL_MINT];
    if (info) {
      solPrice.usd = info.usdPrice || 0;
      solPrice.change24h = info.priceChange24h || 0;
      solPrice.loaded = true;
    }
  } catch (e) {
    // Silently fail — price display just stays at last known or 0
  }
}

// Call once per frame with dt — auto-refreshes on interval
export function updateSolPrice(dt) {
  solPrice._timer += dt;
  if (solPrice._timer >= POLL_INTERVAL / 1000) {
    solPrice._timer = 0;
    fetchSolPrice();
  }
}
