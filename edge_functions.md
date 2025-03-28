
# Edge Functions and Components

This document describes the functionality of each edge function and the components that rely on it.

## analyze-web-content

*   **Functionality:** Analyzes web content to assess the probability of market outcomes.
*   **Components:**
    *   `src/components/market/WebResearchCard.tsx`

## brave-search

*   **Functionality:** Executes a Brave search with rate limiting and retries.
*   **Components:**
    *   `src/components/web-scrape/index.ts` (called by `web-scrape`)
    *   `src/components/market/WebResearchCard.tsx` (indirectly, via `web-scrape`)

## create-research-job

*   **Functionality:** Creates a new research job and starts the background process with improved error handling and real-time updates.
*   **Components:**
    *   `src/components/market/JobQueueResearchCard.tsx`

## deep-research

*   **Functionality:** Performs a deep research on a given topic.
*   **Components:**
    *   `src/components/market/DeepResearchCard.tsx`

## evaluate-qa-final

*   **Functionality:** Evaluates the final question-answer analysis and determines the probability of the event occurring.
*   **Components:**
    *   `src/components/market/QADisplay.tsx`

## evaluate-qa-pair

*   **Functionality:** Evaluates the quality of an analysis in response to a question.
*   **Components:**
    *   `src/components/market/QADisplay.tsx`

## execute-market-order

*   **Functionality:** Executes a market order in the database.
*   **Components:**
    *   `src/components/market/TransactionDialog.tsx`

## extract-research-insights

*   **Functionality:** Extracts structured insights from the research with enhanced error handling and more detailed output formatting.
*   **Components:**
    *   `src/components/market/WebResearchCard.tsx`

## generate-qa-tree

*   **Functionality:** Generates a tree of questions and answers for a given market.
*   **Components:**
    *   `src/components/market/QADisplay.tsx`

## generate-queries

*   **Functionality:** Generates optimized search queries for a given topic with improved context handling and focus on statistical data.
*   **Components:**
    *   `src/components/market/WebResearchCard.tsx`

## get-orderbook

*   **Functionality:** Retrieves the orderbook data for a given token ID.
*   **Components:**
    *   `src/components/market/LiveOrderBook.tsx`

## get-top-movers

*   **Functionality:** Retrieves the top movers markets.
*   **Components:**
    *   `src/hooks/useTopMovers.ts`
    *   `src/hooks/useRelatedMarkets.ts`
    *   `src/components/market/RelatedMarkets.tsx`

## market-analysis

*   **Functionality:** Provides market analysis based on a given message and chat history.
*   **Components:**
    *   `src/components/RightSidebar.tsx`

## polymarket-ws

*   **Functionality:** Retrieves orderbook data from Polymarket WebSocket.
*   **Components:**
    *   `src/components/market/LiveOrderBook.tsx`

## price-history

*   **Functionality:** Retrieves the price history for a given market.
*   **Components:**
    *   `src/components/market/MarketDetails.tsx`

## search-markets

*   **Functionality:** Searches markets based on a given query.
*   **Components:**
    *   `src/hooks/useMarketSearch.ts`

## send-research-notification

*   **Functionality:** Sends a notification email when a research job is completed.
*   **Components:**
    *   `src/components/market/JobQueueResearchCard.tsx` (indirectly, called by `create-research-job`)

## web-research

*   **Functionality:** Performs web research for a given query with improved parallel processing and data collection.
*   **Components:**
    *   `src/components/market/WebResearchCard.tsx`

## web-scrape

*   **Functionality:** Scrapes web content for multiple search queries with optimized request handling and better error management.
*   **Components:**
    *   `src/components/market/WebResearchCard.tsx`
    *   `src/components/market/JobQueueResearchCard.tsx`
