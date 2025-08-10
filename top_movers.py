import argparse
import os
import requests

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://lfmkoismabbhujycnqpn.supabase.co")
SUPABASE_ANON_KEY = os.environ.get(
    "SUPABASE_ANON_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmbWtvaXNtYWJiaHVqeWNucXBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzcwNzQ2NTAsImV4cCI6MjA1MjY1MDY1MH0.OXlSfGb1nSky4rF6IFm1k1Xl-kz7K_u3YgebgP_hBJc",
)


def fetch_top_movers(interval: int, limit: int = 30):
    """Fetch top movers from Supabase function."""
    url = f"{SUPABASE_URL}/functions/v1/get-top-movers"
    headers = {
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        "Content-Type": "application/json",
    }
    payload = {"interval": str(interval), "limit": limit}
    response = requests.post(url, headers=headers, json=payload, timeout=30)
    response.raise_for_status()
    return response.json().get("data", [])


def main():
    parser = argparse.ArgumentParser(
        description="Display the top 30 market movers for a given interval (in minutes)."
    )
    parser.add_argument(
        "interval",
        type=int,
        help="Interval in minutes (e.g., 5, 10, 30, 60, 240, 480, 1440, 10080)",
    )
    args = parser.parse_args()

    movers = fetch_top_movers(args.interval)
    if not movers:
        print("No movers returned.")
        return

    for idx, market in enumerate(movers, start=1):
        question = market.get("question") or market.get("market_slug")
        price_change = market.get("price_change")
        print(f"{idx}. {question} (Δ {price_change}%)")


if __name__ == "__main__":
    main()
