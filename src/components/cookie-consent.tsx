import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

export function CookieConsent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('cookie-consent');
    if (!consent) {
      setShow(true);
    }
  }, []);

  const accept = () => {
    localStorage.setItem('cookie-consent', 'accepted');
    setShow(false);
  };

  const decline = () => {
    localStorage.setItem('cookie-consent', 'declined');
    setShow(false);
  };

  if (!show) return null;

  return (
    <div
      // A landmark with a name, so the banner is reachable by rotor and does
      // not read as orphaned content outside every region.
      role="region"
      aria-label="Cookie notice"
      className="fixed bottom-0 left-0 right-0 p-4 border-t bg-background z-50 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4"
    >
      <div className="text-sm text-muted-foreground flex-1">
        We use cookies to improve your experience. By continuing to visit this site you agree to our use of cookies.
        Learn more in our{' '}
        <Link to="/privacy" className="underline hover:text-foreground">
          Privacy Policy
        </Link>.
      </div>
      <div className="flex gap-2 w-full sm:w-auto">
        <Button variant="outline" className="flex-1 sm:flex-none" onClick={decline} aria-label="Decline cookies">
          Decline
        </Button>
        <Button className="flex-1 sm:flex-none" onClick={accept} aria-label="Accept cookies">
          Accept
        </Button>
      </div>
    </div>
  );
}
