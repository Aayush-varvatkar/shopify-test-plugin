import { useLoaderData, useSubmit, Form, useActionData } from "react-router";
import { useState, useCallback, useEffect } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  AppProvider,
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  TextField,
  Button,
  Banner
} from "@shopify/polaris";
import enTranslations from '@shopify/polaris/locales/en.json';

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const config = await prisma.logisticsSettings.findUnique({
    where: { shop },
  });

  return {
    trackingKey: config?.trackingKey || "",
    shippingApiKey: config?.shippingApiKey || "",
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  
  const formData = await request.formData();
  const trackingKey = formData.get("trackingKey");
  const shippingApiKey = formData.get("shippingApiKey");

  await prisma.logisticsSettings.upsert({
    where: { shop },
    update: { trackingKey, shippingApiKey },
    create: { shop, trackingKey, shippingApiKey },
  });

  return { success: true, trackingKey, shippingApiKey };
};

export default function LogisticsSettingsPage() {
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  
  const [trackingKey, setTrackingKey] = useState(loaderData.trackingKey);
  const [shippingApiKey, setShippingApiKey] = useState(loaderData.shippingApiKey);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (actionData?.success) {
      setIsSaving(false);
    }
  }, [actionData]);

  const handleSave = useCallback(() => {
    setIsSaving(true);
    submit(
      { trackingKey, shippingApiKey },
      { method: "post" }
    );
  }, [trackingKey, shippingApiKey, submit]);

  return (
    <AppProvider i18n={enTranslations}>
      <Page title="Logistics Configuration" narrowWidth>
        <Layout>
          <Layout.Section>
            {actionData?.success && (
              <div style={{ marginBottom: "1rem" }}>
                <Banner title="Keys saved securely!" tone="success" />
              </div>
            )}
            
            <Card sectioned>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">
                  BlueDart API Authentication
                </Text>
                <Text variant="bodyMd" as="p" tone="subdued">
                  Enter your assigned BlueDart API and Tracking credentials below to synchronize live package delivery updates directly into Shopify without delay.
                </Text>
                
                <Form method="post">
                  <BlockStack gap="400">
                    <TextField
                      label="Shipping API License Key"
                      value={shippingApiKey}
                      onChange={setShippingApiKey}
                      autoComplete="off"
                      helpText="The primary license key string generated for your account."
                    />
                    
                    <TextField
                      label="Tracking Key"
                      value={trackingKey}
                      onChange={setTrackingKey}
                      autoComplete="off"
                      type="password"
                      helpText="The secondary key specific for pulling real-time status packets."
                    />
                  </BlockStack>
                </Form>
              </BlockStack>
            </Card>
          </Layout.Section>
          
          <Layout.Section>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
              <Button onClick={handleSave} variant="primary" loading={isSaving}>
                Save Settings
              </Button>
            </div>
          </Layout.Section>
        </Layout>
      </Page>
    </AppProvider>
  );
}
