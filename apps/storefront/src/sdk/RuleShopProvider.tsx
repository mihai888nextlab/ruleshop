import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { bootstrap, getCart, logout as apiLogout } from "@/lib/api";
import { getSessionToken } from "@/lib/session";
import { themeToCssVars } from "@/lib/theme";
import type { BootstrapResponse, CartResponse, ResolvedTheme } from "@/lib/types";

type Status = "loading" | "ready" | "error";

type RuleShopContextValue = {
  status: Status;
  error: string | null;
  store: BootstrapResponse | null;
  theme: ResolvedTheme | null;
  cart: CartResponse | null;
  authenticated: boolean;
  itemCount: number;
  refreshCart: () => Promise<void>;
  signOut: () => void;
  retry: () => void;
};

const RuleShopContext = createContext<RuleShopContextValue | null>(null);

export function useRuleShop() {
  const ctx = useContext(RuleShopContext);
  if (!ctx) throw new Error("useRuleShop must be used within RuleShopProvider");
  return ctx;
}

export function RuleShopProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [store, setStore] = useState<BootstrapResponse | null>(null);
  const [cart, setCart] = useState<CartResponse | null>(null);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    setStatus("loading");
    setError(null);

    const boot = await bootstrap();
    if (!boot.ok) {
      setStore(null);
      setCart(null);
      setError(boot.error);
      setStatus("error");
      return;
    }

    setStore(boot.data);
    const cartResult = await getCart();
    if (cartResult.ok) setCart(cartResult.data);
    else setCart(null);
    setStatus("ready");
  }, []);

  useEffect(() => {
    void load();
  }, [load, tick]);

  const refreshCart = useCallback(async () => {
    const cartResult = await getCart();
    if (cartResult.ok) setCart(cartResult.data);
  }, []);

  const signOut = useCallback(() => {
    apiLogout();
    setTick((n) => n + 1);
  }, []);

  const theme = cart?.store.theme.resolved ?? store?.theme ?? null;
  const themeId =
    cart?.store.theme.themeId ?? store?.theme.key ?? "default";
  const themeVars = theme
    ? (themeToCssVars(theme.tokens) as CSSProperties)
    : undefined;

  const value = useMemo<RuleShopContextValue>(
    () => ({
      status,
      error,
      store,
      theme,
      cart,
      authenticated:
        cart?.viewer.authenticated ?? Boolean(getSessionToken()),
      itemCount: cart?.lines.reduce((n, line) => n + line.quantity, 0) ?? 0,
      refreshCart,
      signOut,
      retry: () => setTick((n) => n + 1),
    }),
    [status, error, store, theme, cart, refreshCart, signOut],
  );

  if (status === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#eef0ee] px-5 text-[#121512]">
        <h1 className="text-2xl font-semibold tracking-tight">
          Magazin neconectat
        </h1>
        <p className="mt-3 max-w-md text-center text-sm text-[#5f6661]">
          {error ??
            "Cheia API lipsește sau este invalidă. Setează RULESHOP_API_KEY (Docker) sau VITE_RULESHOP_API_KEY (.env)."}
        </p>
        <button
          type="button"
          onClick={() => setTick((n) => n + 1)}
          className="mt-6 border border-[#121512] px-4 py-2 text-sm"
        >
          Reîncearcă
        </button>
      </div>
    );
  }

  if (status === "loading" || !store) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#eef0ee] text-sm text-[#5f6661]">
        Se conectează magazinul…
      </div>
    );
  }

  return (
    <RuleShopContext.Provider value={value}>
      <div
        data-theme={themeId}
        style={themeVars}
        className="flex min-h-screen flex-col font-[family-name:var(--font-body)]"
      >
        {children}
      </div>
    </RuleShopContext.Provider>
  );
}
