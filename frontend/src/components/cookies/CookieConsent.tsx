import styled from "styled-components";
import {
  OS_LEGAL_COLORS,
  OS_LEGAL_TYPOGRAPHY,
} from "../../assets/configurations/osLegalStyles";
import {
  modalFooterBorder,
  modalFooterMobile,
} from "../widgets/modals/sharedModalStyles";
import { useMutation, useReactiveVar } from "@apollo/client";
import { toast } from "react-toastify";
import {
  AlertTriangle,
  Cookie,
  Users,
  Settings,
  Monitor,
  BarChart3,
  MousePointer,
  Bug,
  Check,
  Shield,
  FileText,
  Share2,
} from "lucide-react";
import {
  Button,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@os-legal/ui";

import { showCookieAcceptModal, userObj } from "../../graphql/cache";
import {
  ACCEPT_COOKIE_CONSENT,
  AcceptCookieConsentInputs,
  AcceptCookieConsentOutputs,
} from "../../graphql/mutations";
import {
  setAnalyticsConsent,
  isPostHogConfigured,
} from "../../utils/analytics";

const StyledModalWrapper = styled.div`
  .oc-modal-overlay {
    z-index: 2000;
  }

  .oc-modal {
    max-width: 560px;
  }

  .oc-modal-header {
    border-bottom: 1px solid ${OS_LEGAL_COLORS.border};
  }

  .oc-modal-body {
    padding: 1.25rem 1.5rem;
  }

  .oc-modal-footer {
    ${modalFooterBorder}
    ${modalFooterMobile}
    display: flex;
    justify-content: center;
  }
`;

const DemoBanner = styled.div`
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.75rem 1rem;
  background: ${OS_LEGAL_COLORS.warningSurface};
  border: 1px solid ${OS_LEGAL_COLORS.warningBorder};
  border-radius: 8px;
  margin-bottom: 1rem;

  svg {
    flex-shrink: 0;
    color: ${OS_LEGAL_COLORS.warningText};
  }
`;

const DemoBannerText = styled.p`
  margin: 0;
  font-size: 0.8125rem;
  line-height: 1.45;
  color: ${OS_LEGAL_COLORS.warningText};
  font-family: ${OS_LEGAL_TYPOGRAPHY.fontFamilySans};
`;

const Section = styled.div`
  margin-bottom: 1rem;

  &:last-child {
    margin-bottom: 0;
  }
`;

const SectionLabel = styled.h4`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0 0.5rem;
  font-size: 0.8125rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: ${OS_LEGAL_COLORS.textTertiary};
  font-family: ${OS_LEGAL_TYPOGRAPHY.fontFamilySans};

  svg {
    flex-shrink: 0;
    color: ${OS_LEGAL_COLORS.accent};
  }
`;

const SectionBody = styled.p`
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.55;
  color: ${OS_LEGAL_COLORS.textSecondary};
  font-family: ${OS_LEGAL_TYPOGRAPHY.fontFamilySans};
`;

const DataList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0.375rem 0 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
`;

const DataListItem = styled.li`
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.375rem 0.75rem;
  font-size: 0.8125rem;
  color: ${OS_LEGAL_COLORS.textSecondary};
  background: ${OS_LEGAL_COLORS.surfaceLight};
  border-radius: 6px;
  font-family: ${OS_LEGAL_TYPOGRAPHY.fontFamilySans};

  svg {
    flex-shrink: 0;
    color: ${OS_LEGAL_COLORS.textMuted};
  }
`;

const Disclaimer = styled.p`
  margin: 0;
  font-size: 0.75rem;
  line-height: 1.5;
  color: ${OS_LEGAL_COLORS.textMuted};
  font-family: ${OS_LEGAL_TYPOGRAPHY.fontFamilySans};
`;

const AnalyticsNote = styled.p`
  margin: 0.5rem 0 0;
  font-size: 0.75rem;
  line-height: 1.45;
  color: ${OS_LEGAL_COLORS.textMuted};
  font-family: ${OS_LEGAL_TYPOGRAPHY.fontFamilySans};
`;

export const CookieConsentDialog = () => {
  const currentUser = useReactiveVar(userObj);
  // Use userObj for auth check - consistent with NavMenu pattern
  const isAuthenticated = Boolean(currentUser);
  const analyticsEnabled = isPostHogConfigured();

  const [acceptCookieConsent, { loading }] = useMutation<
    AcceptCookieConsentOutputs,
    AcceptCookieConsentInputs
  >(ACCEPT_COOKIE_CONSENT, {
    onCompleted: (data) => {
      if (data.acceptCookieConsent.ok) {
        toast.success("Consent recorded");
        // Enable analytics tracking
        setAnalyticsConsent(true);
        showCookieAcceptModal(false);
      } else {
        toast.error(
          `Failed to record consent: ${data.acceptCookieConsent.message}`
        );
        // Still close the modal and set localStorage as fallback
        localStorage.setItem("oc_cookieAccepted", "true");
        setAnalyticsConsent(true);
        showCookieAcceptModal(false);
      }
    },
    onError: (error) => {
      toast.error(`Error recording consent: ${error.message}`);
      // Still close the modal and set localStorage as fallback
      localStorage.setItem("oc_cookieAccepted", "true");
      setAnalyticsConsent(true);
      showCookieAcceptModal(false);
    },
  });

  const handleAccept = () => {
    if (isAuthenticated) {
      // For authenticated users, call the mutation
      acceptCookieConsent();
    } else {
      // For anonymous users, use localStorage only
      localStorage.setItem("oc_cookieAccepted", "true");
      setAnalyticsConsent(true);
      showCookieAcceptModal(false);
    }
  };

  return (
    <StyledModalWrapper>
      <Modal open onClose={() => {}}>
        <ModalHeader
          title={
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <Cookie size={20} style={{ color: OS_LEGAL_COLORS.accent }} />
              Cookie Policy &amp; Terms
            </span>
          }
        />
        <ModalBody>
          <DemoBanner>
            <AlertTriangle size={18} />
            <DemoBannerText>
              <strong>Demo system</strong> — no guarantee of uptime or data
              retention. Accounts and data may be deleted at any time.
            </DemoBannerText>
          </DemoBanner>

          <Section>
            <SectionLabel>
              <Shield size={14} />
              Cookie Usage
            </SectionLabel>
            <SectionBody>
              This site uses cookies to enhance your experience and help us
              improve OpenContracts. We do not sell or share user information.
            </SectionBody>
          </Section>

          <Section>
            <SectionLabel>
              <FileText size={14} />
              Data We Collect
            </SectionLabel>
            <DataList>
              <DataListItem>
                <Users size={14} />
                User information (email, name, IP)
              </DataListItem>
              <DataListItem>
                <Settings size={14} />
                Usage information
              </DataListItem>
              <DataListItem>
                <Monitor size={14} />
                System information
              </DataListItem>
            </DataList>
          </Section>

          <Section>
            <SectionLabel>
              <Share2 size={14} />
              Data You Agree to Share
            </SectionLabel>
            <SectionBody>
              By using this demo, you agree to share the following under a CC0
              1.0 Universal license:
            </SectionBody>
            <DataList>
              <DataListItem>
                <Users size={14} />
                Labelsets &amp; labels
              </DataListItem>
              <DataListItem>
                <Monitor size={14} />
                Configured data extractors
              </DataListItem>
            </DataList>
          </Section>

          {analyticsEnabled && (
            <Section>
              <SectionLabel>
                <BarChart3 size={14} />
                Analytics
              </SectionLabel>
              <SectionBody>
                We use PostHog to collect anonymous usage analytics:
              </SectionBody>
              <DataList>
                <DataListItem>
                  <BarChart3 size={14} />
                  Page views and navigation patterns
                </DataListItem>
                <DataListItem>
                  <MousePointer size={14} />
                  Feature usage statistics
                </DataListItem>
                <DataListItem>
                  <Bug size={14} />
                  Error tracking for debugging
                </DataListItem>
              </DataList>
              <AnalyticsNote>
                Analytics data is used solely to improve OpenContracts and is
                never sold or shared with third parties.
              </AnalyticsNote>
            </Section>
          )}

          <Disclaimer>
            THE SOFTWARE IS PROVIDED &ldquo;AS IS&rdquo;, WITHOUT WARRANTY OF
            ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
            WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
            NONINFRINGEMENT.
          </Disclaimer>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="primary"
            loading={loading}
            disabled={loading}
            leftIcon={<Check size={16} />}
            onClick={handleAccept}
          >
            Accept &amp; Continue
          </Button>
        </ModalFooter>
      </Modal>
    </StyledModalWrapper>
  );
};
