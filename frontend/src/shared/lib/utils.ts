import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Sem isto, o tailwind-merge lê text-heading como cor e o descarta ao lado de
// text-on-ink. A lista segue os estilos de texto de app/globals.css.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "display-xl",
            "display-lg",
            "display-md",
            "page-title",
            "panel-title",
            "card-title",
            "brand",
            "body-lg",
            "heading",
            "subtitle",
            "body",
            "body-strong",
            "label",
            "label-strong",
            "small",
            "caption",
            "caption-strong",
            "micro",
            "tag",
            "time",
            "badge",
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
