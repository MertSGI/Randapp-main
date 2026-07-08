import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const BASE_URL = process.env.QA_BASE_URL || "http://localhost:3000";
const OUT_DIR = path.join(process.cwd(), "qa-screenshots");
const DEVTOOLS = process.env.QA_INCLUDE_DEVTOOLS === "true";

const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1440, height: 1000 },
};

const MARKETING_ROUTES = [
  { name: "Home", path: "/" },
  { name: "Features", path: "/features" },
  { name: "Pricing", path: "/pricing" },
  { name: "Mobile App", path: "/mobile-app" },
  { name: "Contact", path: "/contact" },
  { name: "Demo Landing", path: "/demo" },
  { name: "Login", path: "/login" },
];

const CUSTOMER_ROUTES = [
  { name: "Book Appointment", path: "/book" },
  { name: "Customer Login", path: "/customer/login" },
];

// Routes requiring Customer Auth
const CUSTOMER_AUTH_ROUTES = [
  { name: "Customer Portal", path: "/customer/appointments" },
];

const ADMIN_ROUTES = [
  { name: "Admin Dashboard", path: "/admin/dashboard" },
  { name: "Admin Setup", path: "/admin/setup" },
  { name: "Admin Appointments", path: "/admin/appointments" },
  { name: "Admin Customers", path: "/admin/customers" },
  { name: "Admin Services", path: "/admin/services" },
  { name: "Admin Staff", path: "/admin/staff" },
  { name: "Admin Profile", path: "/admin/profile" },
  { name: "Admin Referrals", path: "/admin/referrals" },
  { name: "Admin Reports", path: "/admin/reports" },
  { name: "Admin Billing", path: "/admin/billing" },
  { name: "Admin Settings", path: "/admin/settings" },
  { name: "Admin Site Preview", path: "/admin/site-preview" },
];

const SUPER_ADMIN_ROUTES = [
  { name: "SA Dashboard", path: "/super-admin" },
  { name: "SA Tenants", path: "/super-admin/tenants" },
  { name: "SA Subscriptions", path: "/super-admin/subscriptions" },
  { name: "SA Payments", path: "/super-admin/payments" },
  { name: "SA Onboarding", path: "/super-admin/onboarding" },
  { name: "SA Reports", path: "/super-admin/reports" },
  { name: "SA Settings", path: "/super-admin/settings" },
  { name: "SA Payment Test", path: "/super-admin/payment-test" },
  { name: "SA AI Settings", path: "/super-admin/ai-settings" },
  { name: "SA Plans", path: "/super-admin/plans" },
  { name: "SA Referrals", path: "/super-admin/referrals" },
  {
    name: "SA Tenant Preview",
    path: "/super-admin/tenant-preview/tenant_demo",
  },
];

async function captureScreenshots() {
  // Total routes calculation
  const allRoutes = [
    ...MARKETING_ROUTES,
    ...CUSTOMER_ROUTES,
    ...CUSTOMER_AUTH_ROUTES,
    ...ADMIN_ROUTES,
    ...SUPER_ADMIN_ROUTES,
  ];
  const expectedRouteCount = allRoutes.length;
  const expectedScreenshotCount = expectedRouteCount * 2; // mobile + desktop
  const skippedRoutes = []; // We didn't intentionally skip any supported pilot routes based on App.tsx, but if we did, add here.

  console.log(`Starting QA Screenshot Capture to ${OUT_DIR}...`);
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  if (!fs.existsSync(path.join(OUT_DIR, "mobile")))
    fs.mkdirSync(path.join(OUT_DIR, "mobile"), { recursive: true });
  if (!fs.existsSync(path.join(OUT_DIR, "desktop")))
    fs.mkdirSync(path.join(OUT_DIR, "desktop"), { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const reportItems = [];

  const delay = (ms) => new Promise((res) => setTimeout(res, ms));

  // Visit a dummy route to ensure localStorage can be set easily on that origin
  try {
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState("networkidle");
  } catch (e) {
    console.error("Could not reach BASE_URL:", BASE_URL, e);
  }

  // Ensure devtools param to hide/show panel
  const getUrl = (p) =>
    `${BASE_URL}/#${p}${p.includes("?") ? "&" : "?"}devTools=${DEVTOOLS ? "1" : "0"}&lang=tr`;

  const capture = async (group, viewportName, route) => {
    try {
      await page.setViewportSize(VIEWPORTS[viewportName]);
      await page.goto(getUrl(route.path));
      await page.waitForLoadState("networkidle");
      await delay(1500); // Give React time to render

      const pageText = await page.evaluate(() => document.body.innerText);
      let failedAssertion = null;
      if (
        group === "Admin" &&
        pageText.includes("Yönetici Girişi") &&
        !route.path.includes("login")
      ) {
        failedAssertion = "Admin page shows login screen";
      }
      if (
        group === "Super Admin" &&
        pageText.includes("Yönetici Girişi") &&
        !route.path.includes("login")
      ) {
        failedAssertion = "Super Admin page shows login screen";
      }
      if (
        route.path === "/customer/appointments" &&
        pageText.includes("Randevu Panelinize Giriş Yapın")
      ) {
        failedAssertion = "Customer portal shows login screen";
      }
      if (route.path === "/book" && pageText.includes("Hesap Askıda")) {
        failedAssertion = "Booking page shows suspended state";
      }
      
      if (group === "Marketing") {
        const lowerPageText = pageText.toLowerCase();
        if (
          lowerPageText.includes("10.000+") || 
          lowerPageText.includes("1000+") || 
          lowerPageText.includes("0+") ||
          lowerPageText.includes("sahte") ||
          lowerPageText.includes("fake") ||
          lowerPageText.includes("lorem")
        ) {
          failedAssertion = "marketing page shows fake stats or placeholder text";
        }
        
        if (lowerPageText.includes("mock") || lowerPageText.includes("not-live") || lowerPageText.includes("sandbox")) {
          failedAssertion = "marketing page shows mock/sandbox/not-live text";
        }
        
        if (
          lowerPageText.includes("ayşe") && 
          lowerPageText.includes("harika") && 
          lowerPageText.includes("yorum")
        ) {
          failedAssertion = "marketing page includes fake testimonials without disclaimers";
        }

        if (viewportName === "mobile") {
          const hasHorizontalScroll = await page.evaluate(() => {
            return document.documentElement.scrollWidth > document.documentElement.clientWidth;
          });
          if (hasHorizontalScroll) {
             failedAssertion = "mobile homepage has horizontal scroll";
          }
        }
      }

      if (failedAssertion) {
        throw new Error(`Assertion failed: ${failedAssertion}`);
      }

      const filename = `${group.replace(/\\s+/g, "")}-${route.name.replace(/\\s+/g, "-").toLowerCase()}-${viewportName}.png`;
      const filepath = path.join(OUT_DIR, viewportName, filename);

      await page.screenshot({ path: filepath, fullPage: true });

      const fileBuffer = fs.readFileSync(filepath);
      const hash = crypto.createHash("md5").update(fileBuffer).digest("hex");

      reportItems.push({
        group,
        name: route.name,
        path: route.path,
        viewport: viewportName,
        file: `${viewportName}/${filename}`,
        hash,
      });
      console.log(`📸 Captured: ${route.name} (${viewportName})`);
    } catch (err) {
      console.error(`Failed to capture ${route.name} (${viewportName}):`, err);
      skippedRoutes.push({
        name: `${route.name} (${viewportName})`,
        reason: err.message,
      });
    }
  };

  // Inject go_live_status and some demo data for demo tenant so /book and admin panels work with rich data
  await page.evaluate(() => {
    localStorage.setItem("randapp:tenant_demo:go_live_status", '"live"');
    localStorage.setItem("randapp:tenant_demo:provisioning_status", '"live"');

    // Inject Mock staff and services if absent to ensure good screenshots
    const s1 = {
      id: "svc_1",
      name: "Premium Haircut",
      name_tr: "Premium Saç Kesimi",
      price: 50,
      duration: 45,
      active: true,
    };
    const s2 = {
      id: "svc_2",
      name: "Beard Trim",
      name_tr: "Sakal Tıraşı",
      price: 25,
      duration: 30,
      active: true,
    };
    localStorage.setItem(
      "randapp:tenant_demo:services",
      JSON.stringify([s1, s2]),
    );

    const st1 = {
      id: "stf_1",
      name: "Ali Yılmaz",
      title: "Senior Barber",
      active: true,
    };
    localStorage.setItem("randapp:tenant_demo:staff", JSON.stringify([st1]));

    const today = new Date().toISOString().split("T")[0];
    let tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrow = tomorrowDate.toISOString().split("T")[0];

    const a1 = {
      id: "apt_1",
      tenantId: "tenant_demo",
      date: today,
      time: "10:00",
      serviceId: "svc_1",
      staffId: "stf_1",
      user_name: "Demo User",
      user_email: "demo@user.com",
      phone: "5551234567",
      status: "confirmed",
    };
    const a2 = {
      id: "apt_2",
      tenantId: "tenant_demo",
      date: yesterday(),
      time: "14:00",
      serviceId: "svc_2",
      staffId: "stf_1",
      user_name: "Demo User",
      user_email: "demo@user.com",
      phone: "5551234567",
      status: "completed",
    };
    const a3 = {
      id: "apt_3",
      tenantId: "tenant_demo",
      date: tomorrow,
      time: "11:00",
      serviceId: "svc_1",
      staffId: "stf_1",
      user_name: "Ahmet K.",
      user_email: "ahmet@test.com",
      phone: "5559876543",
      status: "confirmed",
    };

    // helper for yesterday inside evaluate
    function yesterday() {
      let y = new Date();
      y.setDate(y.getDate() - 1);
      return y.toISOString().split("T")[0];
    }

    localStorage.setItem(
      "randapp:tenant_demo:appointments",
      JSON.stringify([a1, { ...a2, date: yesterday() }, a3]),
    );

    localStorage.setItem(
      "randapp:tenant_demo:customers",
      JSON.stringify([
        {
          id: "cust_1",
          fullName: "Demo User",
          email: "demo@user.com",
          phone: "5551234567",
          registrationDate: today,
          totalAppointments: 2,
          totalSpent: 75,
          preferredLanguage: "tr",
        },
        {
          id: "cust_2",
          fullName: "Ahmet K.",
          email: "ahmet@test.com",
          phone: "5559876543",
          registrationDate: today,
          totalAppointments: 1,
          totalSpent: 0,
          preferredLanguage: "tr",
        },
      ]),
    );
  });
  await page.reload();
  await page.waitForLoadState("networkidle");

  // 1. Marketing
  for (const route of MARKETING_ROUTES) {
    await capture("Marketing", "desktop", route);
    await capture("Marketing", "mobile", route);
  }

  const doBookingInteractions = async (viewportName) => {
    try {
      await page.setViewportSize(VIEWPORTS[viewportName]);
      await page.goto(getUrl("/book"));
      await page.waitForLoadState("networkidle");
      await delay(1500);

      const pageText = await page.evaluate(() => document.body.innerText);
      if (!pageText.includes("Randevu Al") && !pageText.includes("Book Now")) {
        throw new Error("no 'Randevu Al' CTA is visible on storefront");
      }
      if (
        !pageText.includes("AI Stil Asistanı") &&
        !pageText.includes("AI Style Assistant")
      ) {
        throw new Error("no 'AI Stil Asistanı' CTA is visible on storefront");
      }

      if (
        pageText.includes("Super Admin Önizleme Modu") ||
        pageText.includes("Super Admin Preview")
      ) {
        throw new Error("public /book shows Super Admin preview banner");
      }

      const duplicateHeaderCount = await page.evaluate(() => {
        return document.querySelectorAll("header, nav").length;
      });
      if (duplicateHeaderCount > 1) {
        throw new Error(
          "duplicate header appears on public /book (" +
            duplicateHeaderCount +
            " found)",
        );
      }

      const visibleBrokenImagesCount = await page.evaluate(() => {
        return Array.from(document.images).filter(
          (img) => img.naturalWidth === 0 && img.style.display !== "none",
        ).length;
      });
      if (visibleBrokenImagesCount > 0) {
        throw new Error("broken image icons appear");
      }

      const lowerText = pageText.toLowerCase();
      if (
        lowerText.includes("mock") ||
        lowerText.includes("demo") ||
        lowerText.includes("not live") ||
        lowerText.includes("sandbox")
      ) {
        throw new Error("customer-facing mock/demo/not-live text appears");
      }

      const konumBtn = await page.locator("a:has-text('Konum'), a:has-text('Location')").first();
      if ((await konumBtn.count()) > 0) {
        await konumBtn.click().catch(() => {});
        await delay(500);
      }
      
      const currentUrlKonum = page.url();
      if (currentUrlKonum.includes('/contact')) {
         throw new Error("Konum navigates to marketing contact instead of within-page section");
      }
      
      const hasInstagram =
        pageText.includes("Instagram'dan Kareler") ||
        pageText.includes("Instagram Showcase");
      if (!hasInstagram) throw new Error("no Instagram showcase appears");

      // Check map/contact card (we have working hours or directions)
      const hasMap =
        pageText.includes("Get Directions") ||
        pageText.includes("Haritada Aç") ||
        pageText.includes("Working Hours") ||
        pageText.includes("Çalışma Saatleri");
      if (!hasMap) throw new Error("no map/location visual appears");
      
      const headersCount = await page.evaluate(() => document.querySelectorAll('header').length);
      if (headersCount > 1) {
         throw new Error("duplicate headers appear");
      }

      // 1. Initial Storefront
      const sfName = `customer-book-storefront-${viewportName}.png`;
      await page.screenshot({
        path: path.join(OUT_DIR, viewportName, sfName),
        fullPage: true,
      });
      reportItems.push({
        group: "Customer Interaction",
        name: "Book Storefront",
        path: "/book",
        viewport: viewportName,
        file: `${viewportName}/${sfName}`,
        hash: "none",
      });

      // Action: Open Lightbox
      try {
        const heroSlide = page.locator("section#hero img").first();
        if ((await heroSlide.count()) > 0) {
          await heroSlide.click({ position: { x: 10, y: 10 } }); // Clicking hero opens lightbox
          await delay(800);
          
          // Test Prev/Next in Lightbox
          await page.keyboard.press("ArrowRight");
          await delay(300);
          
          const lightboxName = `customer-book-lightbox-${viewportName}.png`;
          await page.screenshot({
            path: path.join(OUT_DIR, viewportName, lightboxName),
          });
          reportItems.push({
            group: "Customer Interaction",
            name: "Lightbox Open",
            path: "/book",
            viewport: viewportName,
            file: `${viewportName}/${lightboxName}`,
            hash: "none",
          });

          // Close lightbox
          await page.keyboard.press("Escape");
          await delay(500);
        }
      } catch (e) {
        console.log(`Could not capture lightbox: ${e.message}`);
        throw new Error("gallery lightbox cannot open");
      }

      // Take section screenshots
      const sections = [
        "hero",
        "services",
        "ai-assistant",
        "staff",
        "instagram",
        "contact",
      ];
      for (const sectionId of sections) {
        try {
          const locator = page.locator(`section#${sectionId}`);
          if ((await locator.count()) > 0) {
            await locator.scrollIntoViewIfNeeded();
            await delay(500); // UI settle
            const secName = `customer-book-section-${sectionId}-${viewportName}.png`;
            await locator.screenshot({
              path: path.join(OUT_DIR, viewportName, secName),
            });
            reportItems.push({
              group: "Customer Interaction",
              name: `Book Section ${sectionId}`,
              path: "/book",
              viewport: viewportName,
              file: `${viewportName}/${secName}`,
              hash: "none",
            });
          }
        } catch (e) {
          console.log(`Skipping section ${sectionId} capture: ${e.message}`);
        }
      }

      // AI Modal Test
      try {
        const aiCtaBtn = await page.locator("button:has-text('🪄')").first();
        if ((await aiCtaBtn.count()) > 0) {
          await aiCtaBtn.click();
          await delay(1000);
          
          const currentUrl = page.url();
          if (currentUrl.includes('/ai-visualizer')) {
             throw new Error("AI CTA opens a disconnected platform page/header");
          }
          const pageText = await page.evaluate(() => document.body.innerText);
          if (!pageText.includes("Randevu öncesi AI")) {
             throw new Error("AI CTA does not open proper modal");
          }
          
          // Screenshot Modal
          const modalName = `customer-book-ai-modal-${viewportName}.png`;
          await page.screenshot({ path: path.join(OUT_DIR, viewportName, modalName) });
          reportItems.push({
            group: "Customer Interaction",
            name: "AI Modal",
            path: "/book",
            viewport: viewportName,
            file: `${viewportName}/${modalName}`,
            hash: "none"
          });
          
          // Close Modal via top right X or Escape
          await page.locator('button:has(svg):right-of(h3)').first().click().catch(async () => {
             await page.mouse.click(10, 10);
          });
          await delay(1000);
        }
      } catch (e) {
          console.log(`AI Modal test error: ${e.message}`);
          throw e; // rethrow to fail QA script
      }

      // Scroll back up and test service preselection
      await page.evaluate(() => window.scrollTo(0, 0));
      await delay(500);
      try {
        // Find a service CTA button
        const serviceCtaBtn = await page
          .locator("section#services button")
          .first();
        if ((await serviceCtaBtn.count()) > 0) {
          await serviceCtaBtn.click();
          await delay(800);
          const preselectPageText = await page.evaluate(
            () => document.body.innerText,
          );
          if (
            !preselectPageText.includes("Uzman Seçin") &&
            !preselectPageText.includes("Staff Choice") &&
            !preselectPageText.includes("Tarih & Saat") &&
            !preselectPageText.includes("Uzmanlarımız")
          ) {
            throw new Error("service CTA cannot preselect service");
          }
          // Go back to storefront
          await page.goto(getUrl("/book"));
          await page.waitForLoadState("networkidle");
          await delay(1000);
        }
      } catch (e) {
        console.log(`Preselection test error: ${e.message}`);
        throw new Error("service CTA cannot preselect service");
      }

      // Staff Preselection Test
      try {
        const staffCtaBtn = await page.locator("section#staff button").first();
        if ((await staffCtaBtn.count()) > 0) {
          await staffCtaBtn.click();
          await delay(800);
          const preselectPageText2 = await page.evaluate(
            () => document.body.innerText,
          );
          // Either service step again or dates
          if (
            !preselectPageText2.includes("Tarih & Saat") &&
            !preselectPageText2.includes("Hizmet Seç")
          ) {
            throw new Error("staff/no-preference CTA cannot start the flow");
          }
          // Go back to storefront
          await page.goto(getUrl("/book"));
          await page.waitForLoadState("networkidle");
          await delay(1000);
        }
      } catch (e) {
        console.log(`Staff preselection test error: ${e.message}`);
        throw new Error("staff/no-preference CTA cannot start the flow");
      }

      if (viewportName === "mobile") {
        const hasHorizontalScroll = await page.evaluate(() => {
          return (
            document.documentElement.scrollWidth >
            document.documentElement.clientWidth
          );
        });
        if (hasHorizontalScroll)
          throw new Error("mobile has horizontal scroll");
      }

      const bookBtn = await page.$(
        'header button:has-text("Randevu Al"), header button:has-text("Book Now")',
      );
      if (bookBtn) {
        await bookBtn.click();
        await delay(1000);

        let updatedText = await page.evaluate(() => document.body.innerText);
        if (
          updatedText.includes("Bilgileriniz") ||
          updatedText.includes("isminiz") ||
          updatedText.includes("email")
        ) {
          throw new Error("mobile flow starts incorrectly at details step");
        }

        // 2. Service step
        const svcName = `customer-book-service-step-${viewportName}.png`;
        await page.screenshot({
          path: path.join(OUT_DIR, viewportName, svcName),
          fullPage: true,
        });
        reportItems.push({
          group: "Customer Interaction",
          name: "Book Service Step",
          path: "/book",
          viewport: viewportName,
          file: `${viewportName}/${svcName}`,
          hash: "none",
        });

        const serviceBtn = await page.$("button.group.relative");
        if (serviceBtn) {
          await serviceBtn.click();
          await delay(1000);

          // 3. Staff step
          const stfName = `customer-book-staff-step-${viewportName}.png`;
          await page.screenshot({
            path: path.join(OUT_DIR, viewportName, stfName),
            fullPage: true,
          });
          reportItems.push({
            group: "Customer Interaction",
            name: "Book Staff Step",
            path: "/book",
            viewport: viewportName,
            file: `${viewportName}/${stfName}`,
            hash: "none",
          });

          const staffBtn = await page.$(
            'button:has-text("Bana Fark Etmez"), button:has-text("No Preference"), button:has-text("Senior Barber")',
          );
          if (staffBtn) {
            await staffBtn.click();
            await delay(1500);

            // Look for time step
            const hasTimeStep = await page.$('div:has-text("Saat Seç")');

            const timeName = `customer-book-time-step-${viewportName}.png`;
            await page.screenshot({
              path: path.join(OUT_DIR, viewportName, timeName),
              fullPage: true,
            });
            reportItems.push({
              group: "Customer Interaction",
              name: "Book Time Step",
              path: "/book",
              viewport: viewportName,
              file: `${viewportName}/${timeName}`,
              hash: "none",
            });

            // Try to click a time slot
            // Time slots have something like 'py-3 px-2 rounded-xl text-sm font-medium'
            const timeSlot = await page.$$("button:not([disabled])");
            let clickedTime = false;
            for (const btn of timeSlot) {
              const txt = await btn.innerText();
              if (/^\\d{2}:\\d{2}$/.test(txt.trim())) {
                await btn.click();
                clickedTime = true;
                break;
              }
            }

            if (clickedTime) {
              await delay(1000);
              const infoName = `customer-book-info-step-${viewportName}.png`;
              await page.screenshot({
                path: path.join(OUT_DIR, viewportName, infoName),
                fullPage: true,
              });
              reportItems.push({
                group: "Customer Interaction",
                name: "Book Info Step",
                path: "/book",
                viewport: viewportName,
                file: `${viewportName}/${infoName}`,
                hash: "none",
              });
            } else {
              // if we didn't find time, we might have successfully skipped to info step due to earliest slot logic
              const infoName2 = `customer-book-info-step-${viewportName}.png`;
              await page.screenshot({
                path: path.join(OUT_DIR, viewportName, infoName2),
                fullPage: true,
              });
              reportItems.push({
                group: "Customer Interaction",
                name: "Book Info Step",
                path: "/book",
                viewport: viewportName,
                file: `${viewportName}/${infoName2}`,
                hash: "none",
              });
              let currentText = await page.evaluate(
                () => document.body.innerText,
              );
              if (
                !currentText.includes("Bilgiler") &&
                !currentText.includes("Bana Fark Etmez")
              ) {
                throw new Error(
                  "stepper cannot reach time/details/confirmation",
                );
              }
            }
          } else {
            throw new Error(
              "Could not find staff selection or 'No Preference' button.",
            );
          }
        } else {
          throw new Error("service click cannot be found");
        }
      } else {
        throw new Error("Could not find 'Randevu Al' start booking button.");
      }
    } catch (err) {
      console.error(`Booking flow interaction failed on ${viewportName}:`, err);
      skippedRoutes.push({
        name: `Booking Flow Interaction (${viewportName})`,
        reason: err.message,
      });
      throw err;
    }
  };

  await doBookingInteractions("desktop");
  await doBookingInteractions("mobile");

  // 2. Customer
  for (const route of CUSTOMER_ROUTES) {
    await capture("Customer", "desktop", route);
    await capture("Customer", "mobile", route);
  }

  // 2b. Customer (Auth Required)
  await page.goto(`${BASE_URL}/`);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => {
    localStorage.setItem(
      "randapp_customer_auth",
      JSON.stringify({
        id: "cust_demo",
        phone: "5551234567",
        name: "Demo User",
        email: "demo@user.com",
        tenantId: "tenant_demo",
      }),
    );
  });
  await page.reload();
  await page.waitForLoadState("networkidle");
  for (const route of CUSTOMER_AUTH_ROUTES) {
    await capture("Customer", "desktop", route);
    await capture("Customer", "mobile", route);
  }

  // 3. Admin
  await page.goto(`${BASE_URL}/`);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => {
    localStorage.setItem(
      "randapp_mock_user",
      JSON.stringify({
        id: "usr_admin",
        name: "Cemil Kaya",
        email: "admin@randapp.com",
        role: "tenant_owner",
        tenantId: "tenant_demo",
      }),
    );
  });
  await page.reload();
  await page.waitForLoadState("networkidle");
  for (const route of ADMIN_ROUTES) {
    await capture("Admin", "desktop", route);
    await capture("Admin", "mobile", route);
  }

  // 4. Super Admin
  await page.goto(`${BASE_URL}/`);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => {
    localStorage.setItem(
      "randapp_mock_user",
      JSON.stringify({
        id: "usr_super",
        name: "Super Admin",
        email: "superadmin@randapp.com",
        role: "super_admin",
        tenantId: "tenant_platform",
      }),
    );
  });
  await page.reload();
  await page.waitForLoadState("networkidle");
  for (const route of SUPER_ADMIN_ROUTES) {
    await capture("Super Admin", "desktop", route);
    await capture("Super Admin", "mobile", route);
  }

  await browser.close();

  // Duplicate detection
  const hashGroups = {};
  reportItems.forEach((item) => {
    if (!hashGroups[item.hash]) hashGroups[item.hash] = [];
    hashGroups[item.hash].push(item);
  });

  const duplicateGroups = Object.values(hashGroups).filter(
    (group) => group.length > 2,
  );
  const badDuplicates = []; // We allow identical mobile/desktop pairings if they really are, but not whole groups

  reportItems.forEach((item) => {
    const sameGroupHashes = hashGroups[item.hash].filter(
      (i) => i.group === item.group && i.viewport === item.viewport,
    );
    if (sameGroupHashes.length > 3) {
      // E.g. all 12 admin routes look exactly the same
      badDuplicates.push(
        `Found ${sameGroupHashes.length} identical screenshots for ${item.group} (${item.viewport})`,
      );
    }
  });

  const uniqueBadDuplicates = [...new Set(badDuplicates)];
  if (uniqueBadDuplicates.length > 0) {
    console.error(
      "❌ QA Failed due to unacceptable screenshot duplication (likely a login wall)",
    );
    uniqueBadDuplicates.forEach((msg) => console.error(msg));
    skippedRoutes.push({
      name: "DUPLICATES",
      reason: uniqueBadDuplicates.join("; "),
    });
  }

  // Generate HTML Report
  const baseSnapshots = reportItems.filter(
    (i) => i.group !== "Customer Interaction",
  );
  const interactionSnapshots = reportItems.filter(
    (i) => i.group === "Customer Interaction",
  );
  const expectedInteractionCount = 12; // 6 interactions x 2 viewports

  const viewportMismatches = interactionSnapshots.filter(
    (i) => !i.file.startsWith(i.viewport + "/"),
  );

  const hasQaError =
    skippedRoutes.length > 0 ||
    uniqueBadDuplicates.length > 0 ||
    baseSnapshots.length < expectedScreenshotCount ||
    interactionSnapshots.length < expectedInteractionCount ||
    viewportMismatches.length > 0;

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Randapp QA Screenshot Report</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #f9fafb; color: #111827; padding: 2rem; margin: 0; }
    h1 { border-bottom: 2px solid #e5e7eb; padding-bottom: 0.5rem; }
    .summary { background: #eff6ff; padding: 1.5rem; border-radius: 0.5rem; border: 1px solid #bfdbfe; margin-bottom: 2rem; }
    .summary h2 { margin-top: 0; }
    .summary ul { margin: 0; padding-left: 1.5rem; list-style-type: none; padding-left: 0; }
    .summary li { margin-bottom: 0.5rem; }
    .status-pass { color: #15803d; font-weight: bold; font-size: 1.2rem; }
    .status-fail { color: #b91c1c; font-weight: bold; font-size: 1.2rem; }
    .skipped { background: #fefce8; padding: 1rem; border-radius: 0.5rem; border: 1px solid #fef08a; margin-bottom: 2rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 2rem; margin-top: 2rem; }
    .card { background: white; border-radius: 0.5rem; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .card-header { padding: 1rem; border-bottom: 1px solid #e5e7eb; background: #f3f4f6; }
    .card-header h3 { margin: 0; font-size: 1.1rem; }
    .card-header p { margin: 0.2rem 0 0; font-size: 0.85rem; color: #4b5563; }
    .img-container { padding: 1rem; background: #e5e7eb; display: flex; justify-content: center; }
    img { max-width: 100%; height: auto; border: 1px solid #d1d5db; border-radius: 0.25rem; }
  </style>
</head>
<body>
  <h1>Randapp QA Screenshot Report</h1>
  <div class="summary">
    <h2>Summary</h2>
    <ul>
      <li><strong>Overall Status:</strong> <span class="${hasQaError ? "status-fail" : "status-pass"}">${hasQaError ? "FAIL" : "PASS"}</span></li>
      <li><strong>Date:</strong> ${new Date().toLocaleString()}</li>
      <li><strong>Expected Base Screenshots:</strong> ${expectedScreenshotCount} (Mobile + Desktop)</li>
      <li><strong>Captured Base Screenshots:</strong> ${baseSnapshots.length}</li>
      <li><strong>Expected Interactions:</strong> ${expectedInteractionCount}</li>
      <li><strong>Captured Interactions:</strong> ${interactionSnapshots.length}</li>
      <li><strong>Skipped/Failed Routes:</strong> ${skippedRoutes.length}</li>
      <li><strong>Identical Clusters:</strong> ${duplicateGroups.length}</li>
      <li><strong>Viewport Mismatches:</strong> ${viewportMismatches.length}</li>
    </ul>
    ${hasQaError ? '<p style="color: #b91c1c; font-weight: bold; margin-top: 1rem;">Warning: QA run is incomplete or has failed assertions.</p>' : ""}
  </div>
  ${
    skippedRoutes.length > 0
      ? `
  <div class="skipped">
    <h3 style="margin-top: 0; color: #b45309;">Failed Routes & Assertions</h3>
    <ul style="color: #92400e; margin-bottom: 0;">
      ${skippedRoutes.map((sr) => `<li><strong>${sr.name}:</strong> ${sr.reason}</li>`).join("")}
    </ul>
  </div>`
      : ""
  }
  
  <div class="grid">
    ${reportItems
      .map(
        (item) => `
      <div class="card">
        <div class="card-header">
          <h3>${item.group} - ${item.name} (${item.viewport})</h3>
          <p>Path: <code>${item.path}</code></p>
        </div>
        <div class="img-container">
          <a href="${item.file}" target="_blank">
            <img src="${item.file}" alt="${item.name}" loading="lazy" />
          </a>
        </div>
      </div>
    `,
      )
      .join("")}
  </div>
</body>
</html>
  `.trim();

  fs.writeFileSync(
    path.join(OUT_DIR, "QA_SCREENSHOT_REPORT.html"),
    htmlContent,
  );
  console.log("\\n📊 Summary:");
  console.log(`- Expected Routes: ${expectedRouteCount}`);
  console.log(`- Expected Screenshots: ${expectedScreenshotCount}`);
  console.log(`- Captured Screenshots: ${reportItems.length}`);
  console.log("✅ Generated QA_SCREENSHOT_REPORT.html");

  // Generate README.md
  const readmeContent = `
# Randapp Automated QA Screenshots

This folder contains automatically captured screenshots of the Randapp application for QA purposes.

## How to Capture
Run from the project root:
\`\`\`bash
npm run qa:screenshots
\`\`\`
*(Ensure the local dev server is running on localhost:3000 or configure QA_BASE_URL)*

## Outputs
- \`mobile/\` - Contains 390x844 viewports
- \`desktop/\` - Contains 1440x1000 viewports
- \`QA_SCREENSHOT_REPORT.html\` - Visual review dashboard

## Priority Review Order
1. Homepage (\`/\`)
2. Pricing (\`/pricing\`)
3. Booking Flow (\`/book\`)
4. Booking Success (if generated)
5. Admin Mobile (\`/admin\`)
6. Admin Settings
7. Super Admin Mobile (\`/super-admin\`)
8. Payment Diagnostics (\`/super-admin/payment-test\`)

## Known Limitations
- Modals that require interaction to open are not captured automatically in this pass.
- Timeouts might occasionally cut off images loading if network is slow. Re-run if a screenshot looks empty.
  `.trim();

  fs.writeFileSync(path.join(OUT_DIR, "README.md"), readmeContent);
  console.log("✅ Generated README.md");
  console.log("🎉 Screenshot Capture Complete!");

  let hasError = false;
  if (skippedRoutes.length > 0) {
    console.error(
      "❌ QA Failed: Some required routes were skipped or assertions failed.",
    );
    hasError = true;
  }
  if (baseSnapshots.length < expectedScreenshotCount) {
    console.error(
      `❌ QA Failed: Expected at least ${expectedScreenshotCount} base screenshots, but only captured ${baseSnapshots.length}.`,
    );
    hasError = true;
  }
  if (interactionSnapshots.length < expectedInteractionCount) {
    console.error(
      `❌ QA Failed: Expected at least ${expectedInteractionCount} interaction screenshots, but only captured ${interactionSnapshots.length}.`,
    );
    hasError = true;
  }
  if (viewportMismatches.length > 0) {
    console.error(
      `❌ QA Failed: ${viewportMismatches.length} interaction screenshots have the wrong viewport.`,
    );
    hasError = true;
  }
  if (uniqueBadDuplicates.length > 0) {
    console.error(
      "❌ QA Failed: Unacceptable screenshot duplication detected.",
    );
    hasError = true;
  }

  if (hasError) {
    process.exit(1);
  }
}

captureScreenshots().catch(console.error);
