import { RouterProvider, createMemoryRouter } from 'react-router';
import { router } from './routes';
import { RestaurantProvider } from './context/RestaurantContext';
import { Toaster } from 'sonner';

// Restaurant Management System - Out of Stock Detection Active
const isBrowser = typeof window !== 'undefined' && typeof window.location !== 'undefined' && !!window.history.pushState;

const activeRouter = isBrowser ? router : createMemoryRouter([{ path: '*', Component: () => null }]);

export default function App() {
  return (
    <RestaurantProvider>
      <RouterProvider router={activeRouter} />
      <Toaster position="top-right" richColors />
    </RestaurantProvider>
  );
}