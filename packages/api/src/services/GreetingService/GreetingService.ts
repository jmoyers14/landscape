export interface Greeting {
  id: string;
  message: string;
}

export interface GreetingService {
  greet(name: string): string;
  list(): Greeting[];
  add(message: string): Greeting;
}
