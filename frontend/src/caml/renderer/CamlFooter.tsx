import React from "react";

import type { CamlFooter } from "../parser/types";
import { FooterSection, FooterNav, FooterLink, FooterNotice } from "./styles";

export interface CamlFooterRendererProps {
  footer: CamlFooter;
}

export const CamlFooterRenderer: React.FC<CamlFooterRendererProps> = ({
  footer,
}) => {
  return (
    <FooterSection>
      {footer.nav && footer.nav.length > 0 && (
        <FooterNav>
          {footer.nav.map((item, i) => (
            <FooterLink
              key={i}
              href={item.href}
              target={item.href.startsWith("http") ? "_blank" : undefined}
              rel={
                item.href.startsWith("http") ? "noopener noreferrer" : undefined
              }
            >
              {item.label}
            </FooterLink>
          ))}
        </FooterNav>
      )}

      {footer.notice && <FooterNotice>{footer.notice}</FooterNotice>}
    </FooterSection>
  );
};
