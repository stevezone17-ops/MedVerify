import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
  type MouseEvent,
} from 'react';

export interface LocationState {
  pathname: string;
  search: string;
  state: any;
}

export type NavigateOptions = {
  replace?: boolean;
  state?: any;
};

export type NavigateFunction = (to: string | number, options?: NavigateOptions) => void;

interface RouterContextType {
  location: LocationState;
  navigate: NavigateFunction;
}

const RouterContext = createContext<RouterContextType | null>(null);

interface OutletContextType {
  outlet: ReactNode | null;
  params: Record<string, string>;
}

const OutletContext = createContext<OutletContextType>({
  outlet: null,
  params: {},
});

export function useRouter(): RouterContextType {
  const ctx = useContext(RouterContext);
  if (!ctx) {
    throw new Error('useRouter must be used within a BrowserRouter');
  }
  return ctx;
}

export function useLocation(): LocationState {
  return useRouter().location;
}

export function useNavigate(): NavigateFunction {
  return useRouter().navigate;
}

export function useParams<T extends Record<string, string | undefined> = Record<string, string>>(): T {
  return useContext(OutletContext).params as T;
}

export function useSearchParams(): [URLSearchParams, (params: URLSearchParams | Record<string, string>) => void] {
  const { location, navigate } = useRouter();
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);

  const setSearchParams = useCallback(
    (nextInit: URLSearchParams | Record<string, string>) => {
      const sp = nextInit instanceof URLSearchParams ? nextInit : new URLSearchParams(nextInit);
      navigate(`${location.pathname}?${sp.toString()}`, { replace: true });
    },
    [location.pathname, navigate],
  );

  return [searchParams, setSearchParams];
}

export function BrowserRouter({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState<LocationState>(() => ({
    pathname: window.location.pathname || '/',
    search: window.location.search || '',
    state: window.history.state,
  }));

  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      setLocation({
        pathname: window.location.pathname || '/',
        search: window.location.search || '',
        state: e.state,
      });
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate: NavigateFunction = useCallback((to, options = {}) => {
    if (typeof to === 'number') {
      window.history.go(to);
      return;
    }

    const [newPath, newSearch = ''] = to.split('?');
    const fullSearch = newSearch ? `?${newSearch}` : '';

    if (options.replace) {
      window.history.replaceState(options.state, '', newPath + fullSearch);
    } else {
      window.history.pushState(options.state, '', newPath + fullSearch);
    }

    setLocation({
      pathname: newPath || '/',
      search: fullSearch,
      state: options.state,
    });
  }, []);

  const value = useMemo(() => ({ location, navigate }), [location, navigate]);

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export interface RouteProps {
  path?: string;
  index?: boolean;
  element?: ReactNode;
  children?: ReactNode;
}

export function Route(_props: RouteProps): null {
  return null;
}

export function Outlet(): ReactNode {
  const { outlet } = useContext(OutletContext);
  return outlet;
}

function matchPath(
  pattern: string,
  pathname: string,
): { matches: boolean; params: Record<string, string> } {
  if (pattern === '*') return { matches: true, params: {} };

  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);

  if (patternParts.length !== pathParts.length) {
    return { matches: false, params: {} };
  }

  const extractedParams: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    const pPart = patternParts[i];
    const actualPart = pathParts[i];

    if (pPart.startsWith(':')) {
      extractedParams[pPart.slice(1)] = decodeURIComponent(actualPart);
    } else if (pPart.toLowerCase() !== actualPart.toLowerCase()) {
      return { matches: false, params: {} };
    }
  }

  return { matches: true, params: extractedParams };
}

export function Routes({ children }: { children: ReactNode }) {
  const { location } = useRouter();
  const routes = React.Children.toArray(children) as React.ReactElement<RouteProps>[];

  let matchedElement: ReactNode = null;
  let matchedOutlet: ReactNode = null;
  let matchedParams: Record<string, string> = {};

  const currentPath =
    location.pathname.endsWith('/') && location.pathname.length > 1
      ? location.pathname.slice(0, -1)
      : location.pathname;

  for (const route of routes) {
    const { path, element, children: childRoutes } = route.props;

    // Check if parent matches prefix (e.g. /app)
    if (path && childRoutes) {
      const normalizedParent = path.startsWith('/') ? path : `/${path}`;
      if (currentPath === normalizedParent || currentPath.startsWith(`${normalizedParent}/`)) {
        const subPath = currentPath.slice(normalizedParent.length) || '/';
        const nestedRoutes = React.Children.toArray(childRoutes) as React.ReactElement<RouteProps>[];

        let childElem: ReactNode = null;
        let childParams: Record<string, string> = {};

        for (const cRoute of nestedRoutes) {
          if (cRoute.props.index && (subPath === '/' || subPath === '')) {
            childElem = cRoute.props.element;
            break;
          }

          if (cRoute.props.path) {
            const childPattern = cRoute.props.path.startsWith('/')
              ? cRoute.props.path
              : `/${cRoute.props.path}`;
            const res = matchPath(childPattern, subPath);
            if (res.matches) {
              childElem = cRoute.props.element;
              childParams = res.params;
              break;
            }
          }
        }

        matchedElement = element;
        matchedOutlet = childElem;
        matchedParams = childParams;
        break;
      }
    }

    if (path) {
      const res = matchPath(path, currentPath);
      if (res.matches) {
        matchedElement = element;
        matchedParams = res.params;
        break;
      }
    }
  }

  return (
    <OutletContext.Provider value={{ outlet: matchedOutlet, params: matchedParams }}>
      {matchedElement}
    </OutletContext.Provider>
  );
}

export function Navigate({ to, replace = true }: { to: string; replace?: boolean }) {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(to, { replace });
  }, [navigate, to, replace]);
  return null;
}

export interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  to: string;
  replace?: boolean;
  state?: any;
}

export function Link({ to, replace, state, onClick, children, ...rest }: LinkProps) {
  const navigate = useNavigate();

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (onClick) onClick(e);
    if (!e.defaultPrevented && e.button === 0 && !e.metaKey && !e.altKey && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      navigate(to, { replace, state });
    }
  };

  return (
    <a href={to} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}

export interface NavLinkProps extends Omit<LinkProps, 'className'> {
  className?: string | ((props: { isActive: boolean }) => string);
}

export function NavLink({ to, className, children, ...rest }: NavLinkProps) {
  const { location } = useRouter();
  const isActive = location.pathname === to || (to !== '/' && to !== '/app' && location.pathname.startsWith(to));

  const resolvedClass = typeof className === 'function' ? className({ isActive }) : className;

  return (
    <Link to={to} className={resolvedClass} {...rest}>
      {children}
    </Link>
  );
}
