declare module 'sentiment' {
  export default class Sentiment {
    analyze(
      phrase: string,
      options?: {
        language?: string;
        extras?: Record<string, number>;
      },
      callback?: (err: any, result: any) => void
    ): {
      score: number;
      comparative: number;
      tokens: string[];
      words: string[];
      positive: string[];
      negative: string[];
    };
  }
}
