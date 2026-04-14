/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import Compressor from './components/Compressor';
import { Toaster } from 'sonner';

export default function App() {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <Compressor />
      <Toaster position="top-center" />
    </div>
  );
}

