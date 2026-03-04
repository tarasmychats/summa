export type AssetCategory = "crypto" | "stock" | "fiat";

export interface PriceRequest {
  assets: Array<{
    id: string;
    category: AssetCategory;
  }>;
  baseCurrency: string;
}

export interface AssetPrice {
  id: string;
  category: AssetCategory;
  price: number;
  currency: string;
  change24h: number | null;
  updatedAt: string;
}

export interface PriceResponse {
  prices: AssetPrice[];
  baseCurrency: string;
  timestamp: string;
  warnings?: string[];
}

export interface ErrorResponse {
  error: string;
  details?: string;
}

export interface SearchResult {
  id: string;
  name: string;
  symbol: string;
  category: AssetCategory;
}

export interface SearchResponse {
  results: SearchResult[];
}
