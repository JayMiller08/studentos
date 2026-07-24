import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl p-6 py-12">
      <Link to="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-8">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Home
      </Link>
      <h1 className="text-3xl font-bold mb-6">Terms of Service</h1>
      <div className="prose prose-sm sm:prose dark:prose-invert">
        <p>Last updated: {new Date().toLocaleDateString()}</p>
        <p>This is a placeholder for the Terms of Service.</p>
        <h2>1. Acceptance of Terms</h2>
        <p>By accessing or using our services, you agree to be bound by these Terms.</p>
        <h2>2. Use of Services</h2>
        <p>You agree to use our services only for lawful purposes.</p>
      </div>
    </div>
  );
}
