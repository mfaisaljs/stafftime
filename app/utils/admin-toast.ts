type AdminToastOptions = {
  isError?: boolean;
  duration?: number;
};

export function showAdminToast(
  message: string,
  options: AdminToastOptions = {},
) {
  if (!message || typeof window === "undefined") return;

  try {
    const toast = (
      window as Window & {
        shopify?: {
          toast?: {
            show: (
              content: string,
              toastOptions?: { duration?: number; isError?: boolean },
            ) => void;
          };
        };
      }
    ).shopify?.toast;

    if (toast && typeof toast.show === "function") {
      toast.show(message, {
        duration: options.duration ?? 5000,
        isError: options.isError ?? false,
      });
    }
  } catch {
    // Toast is best-effort feedback only.
  }
}
