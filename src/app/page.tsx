import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <nav className="border-b bg-white/80 backdrop-blur-sm fixed w-full z-10">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <span className="font-semibold text-xl">Acolite</span>
          <div className="flex gap-4">
            <Link href="/login">
              <Button variant="ghost">Login</Button>
            </Link>
            <Link href="/login">
              <Button>Get Started</Button>
            </Link>
          </div>
        </div>
      </nav>

      <main className="pt-32 pb-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-5xl font-bold tracking-tight text-gray-900 mb-6">
            Build and Run Your Business with AI
          </h1>
          <p className="text-xl text-gray-600 mb-10">
            Automate operations, scale efficiently, and grow your business
            using intelligent AI agents.
          </p>
          <Link href="/login">
            <Button size="lg" className="text-lg px-8 py-6">
              Start Building
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
