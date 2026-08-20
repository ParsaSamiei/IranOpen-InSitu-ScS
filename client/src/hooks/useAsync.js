import { useEffect, useState } from 'react';

export function useAsync(fn, deps) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const reload = () => {
    setState((s) => ({ ...s, loading: true }));
    fn().then((data) => setState({ data, loading: false, error: null }))
      .catch((error) => setState({ data: null, loading: false, error: error.message }));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reload, deps);
  return [state, reload];
}
