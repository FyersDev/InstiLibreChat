import { Link } from 'react-router-dom';

/**
 * Legacy organization-directory admin UI lived under `/admin` and called removed APIs.
 * Deep links land here with an explanatory message.
 */
export default function AdminRoute() {
  const baseHref = document.querySelector('base')?.getAttribute('href') || '/';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#F7F7F7] px-6 py-12 dark:bg-[#111]">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
        Admin console unavailable
      </h1>
      <p className="max-w-md text-center text-sm text-gray-600 dark:text-gray-400">
        User and organization administration for this app relied on legacy endpoints that have been
        removed from the client. Manage users through your FYERS institutional tooling.
      </p>
      <Link
        to={`${baseHref}c/new`}
        className="rounded-lg bg-[#2434E7] px-4 py-2 text-sm font-medium text-white hover:bg-[#1a28b8]"
      >
        Back to FIA research
      </Link>
    </div>
  );
}
