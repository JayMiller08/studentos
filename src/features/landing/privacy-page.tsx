import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl p-6 py-12">
      <Link to="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-8">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Home
      </Link>
      <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
      <div className="prose prose-sm sm:prose dark:prose-invert">
        <p>Last updated: {new Date().toLocaleDateString()}</p>
        <p>This is a placeholder for the Privacy Policy.</p>
        <h2>1. Information We Collect</h2>
        <p>We collect information you provide directly to us.</p>
        <h2>2. How We Use Information</h2>
        <p>We use the information we collect to provide, maintain, and improve our services.</p>
      </div>
    </div>
  );
}
