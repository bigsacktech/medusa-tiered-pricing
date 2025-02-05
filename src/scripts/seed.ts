import {
  createApiKeysWorkflow,
  createCollectionsWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createTaxRegionsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  updateStoresWorkflow,
  createStockLocationsWorkflow,
  createShippingOptionsWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
} from "@medusajs/medusa/core-flows";
import { ExecArgs } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils";

export default async function seedDemoData({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const fulfillmentModule = container.resolve(Modules.FULFILLMENT);
  const remoteLink = container.resolve(ContainerRegistrationKeys.REMOTE_LINK);
  const salesChannelModule = container.resolve(Modules.SALES_CHANNEL);
  const storeModule = container.resolve(Modules.STORE);

  const countries = ["ch"];

  logger.info("Seeding store data...");
  const [store] = await storeModule.listStores();
  let defaultSalesChannel = await salesChannelModule.listSalesChannels({
    name: "Default Sales Channel",
  });

  if (!defaultSalesChannel.length) {
    // create the default sales channel
    const { result: salesChannelResult } = await createSalesChannelsWorkflow(
      container
    ).run({
      input: {
        salesChannelsData: [
          {
            name: "Default Sales Channel",
          },
        ],
      },
    });
    defaultSalesChannel = salesChannelResult;
  }

  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: {
        supported_currencies: [
          {
            currency_code: "chf",
            is_default: true,
          },
        ],
        default_sales_channel_id: defaultSalesChannel[0].id,
      },
    },
  });
  logger.info("Seeding region data...");
  const { result: regionResult } = await createRegionsWorkflow(container).run({
    input: {
      regions: [
        {
          name: "Switzerland",
          currency_code: "chf",
          countries,
          payment_providers: ["pp_system_default"],
        },
      ],
    },
  });
  const region = regionResult[0];
  logger.info("Finished seeding regions.");

  logger.info("Seeding tax regions...");
  await createTaxRegionsWorkflow(container).run({
    input: countries.map((country_code) => ({
      country_code,
    })),
  });
  logger.info("Finished seeding tax regions.");

  // ########### Shipping ###########

  // Create Shipping Profile
  const shippingProfile = await fulfillmentModule.createShippingProfiles({
    name: "Default",
    type: "default",
  });

  // Bags
  const { result: bagsStockLocationResult } =
    await createStockLocationsWorkflow(container).run({
      input: {
        locations: [
          {
            name: "Bags",
            address: {
              city: "Grandvaux",
              country_code: "ch",
              address_1: "",
            },
          },
        ],
      },
    });
  const bagsStockLocation = bagsStockLocationResult[0];

  await remoteLink.create({
    [Modules.STOCK_LOCATION]: {
      stock_location_id: bagsStockLocation.id,
    },
    [Modules.FULFILLMENT]: {
      fulfillment_provider_id: "manual_manual",
    },
  });

  await linkSalesChannelsToStockLocationWorkflow(container).run({
    input: {
      id: bagsStockLocation.id,
      add: [defaultSalesChannel[0].id],
    },
  });

  // Create Fulfillment Sets
  const bagsFulfillmentSet = await fulfillmentModule.createFulfillmentSets({
    name: "Bags",
    type: "shipping",
    service_zones: [
      {
        name: "Switzerland Bags",
        geo_zones: [
          {
            country_code: "ch",
            type: "country",
          },
        ],
      },
    ],
  });

  await remoteLink.create({
    [Modules.STOCK_LOCATION]: {
      stock_location_id: bagsStockLocation.id,
    },
    [Modules.FULFILLMENT]: {
      fulfillment_set_id: bagsFulfillmentSet.id,
    },
  });

  const pickupFulfillmentSet = await fulfillmentModule.createFulfillmentSets({
    name: "Pickup",
    type: "pickup",
    service_zones: [
      {
        name: "Switzerland Pickups",
        geo_zones: [
          {
            country_code: "ch",
            type: "country",
          },
        ],
      },
    ],
  });

  await remoteLink.create({
    [Modules.STOCK_LOCATION]: {
      stock_location_id: bagsStockLocation.id,
    },
    [Modules.FULFILLMENT]: {
      fulfillment_set_id: pickupFulfillmentSet.id,
    },
  });

  // Create Shipping Options

  logger.info("Creating Bag Standard Shipping Option...");
  await createShippingOptionsWorkflow(container).run({
    input: [
      {
        name: "Standard Shipping",
        price_type: "flat",
        provider_id: "manual_manual",
        service_zone_id: bagsFulfillmentSet.service_zones[0].id,
        shipping_profile_id: shippingProfile.id,
        type: {
          label: "Standard",
          description: "Standard shipping for Switzerland",
          code: "standard_ch",
        },
        prices: [
          {
            currency_code: "chf",
            amount: 9.7,
          },
          {
            region_id: region.id,
            amount: 9.7,
          },
        ],
      },
    ],
  });

  logger.info("Seeding publishable API key data...");
  const { result: publishableApiKeyResult } = await createApiKeysWorkflow(
    container
  ).run({
    input: {
      api_keys: [
        {
          title: "Webshop",
          type: "publishable",
          created_by: "",
        },
      ],
    },
  });
  const publishableApiKey = publishableApiKeyResult[0];

  await linkSalesChannelsToApiKeyWorkflow(container).run({
    input: {
      id: publishableApiKey.id,
      add: [defaultSalesChannel[0].id],
    },
  });
  logger.info("Finished seeding publishable API key data.");

  logger.info("Seeding product data...");

  const { result: collectionResult } = await createCollectionsWorkflow(
    container
  ).run({
    input: {
      collections: [
        {
          title: "Bags",
          handle: "bags",
        },
        {
          title: "Pickups",
          handle: "pickups",
        },
      ],
    },
  });

  await createProductsWorkflow(container).run({
    input: {
      products: [
        // Bags
        {
          title: "Sac 1m3",
          collection_id: collectionResult.find(
            (collection) => collection.title === "Bags"
          ).id,
          description:
            "Utilisez ce Big Sack pour les déchets lourds tels que le béton, les briques et la terre.",
          handle: "bag-1m3",
          status: ProductStatus.PUBLISHED,
          images: [
            {
              url: "http://localhost:9000/static/bag_1m3.jpg",
            },
          ],
          options: [
            {
              title: "default",
              values: ["default"],
            },
          ],
          variants: [
            {
              title: "Default variant",
              options: {
                default: "default",
              },
              prices: [
                {
                  amount: 41.9,
                  currency_code: "chf",
                },
              ],
            },
          ],
          sales_channels: [
            {
              id: defaultSalesChannel[0].id,
            },
          ],
        },
        {
          title: "Sac 2m3",
          collection_id: collectionResult.find(
            (collection) => collection.title === "Bags"
          ).id,
          description:
            "Utilisez ce Big Sack pour les déchets lourds tels que le béton, les briques et la terre.",
          handle: "bag-2m3",
          status: ProductStatus.PUBLISHED,
          images: [
            {
              url: "http://localhost:9000/static/bag_2m3.jpg",
            },
          ],
          options: [
            {
              title: "default",
              values: ["default"],
            },
          ],
          variants: [
            {
              title: "Default variant",
              options: {
                default: "default",
              },
              prices: [
                {
                  amount: 41.9,
                  currency_code: "chf",
                },
              ],
            },
          ],
          sales_channels: [
            {
              id: defaultSalesChannel[0].id,
            },
          ],
        },
        {
          title: "Sac 3m3",
          collection_id: collectionResult.find(
            (collection) => collection.title === "Bags"
          ).id,
          description:
            "Utilisez ce Big Sack pour les déchets lourds tels que le béton, les briques et la terre.",
          handle: "bag-3m3",
          status: ProductStatus.PUBLISHED,
          images: [
            {
              url: "http://localhost:9000/static/bag_3m3.jpg",
            },
          ],
          options: [
            {
              title: "default",
              values: ["default"],
            },
          ],
          variants: [
            {
              title: "Default variant",
              options: {
                default: "default",
              },
              prices: [
                {
                  amount: 41.9,
                  currency_code: "chf",
                },
              ],
            },
          ],
          sales_channels: [
            {
              id: defaultSalesChannel[0].id,
            },
          ],
        },
        {
          title: "Amiante",
          collection_id: collectionResult.find(
            (collection) => collection.title === "Bags"
          ).id,
          description:
            "Utiliser ce sac spécifiquement pour les déchets contenant de l'amiante. Certificat amiante fourni!",
          handle: "bag-asbestos",
          status: ProductStatus.PUBLISHED,
          images: [
            {
              url: "http://localhost:9000/static/bag_asbestos.jpg",
            },
          ],
          options: [
            {
              title: "size",
              values: ["1m3", "2m3"],
            },
          ],
          variants: [
            {
              title: "Medium 1m3",
              options: {
                size: "1m3",
              },
              prices: [
                {
                  amount: 21.9,
                  currency_code: "chf",
                },
              ],
            },
            {
              title: "Large 2m3",
              options: {
                size: "2m3",
              },
              prices: [
                {
                  amount: 31.9,
                  currency_code: "chf",
                },
              ],
            },
          ],
          sales_channels: [
            {
              id: defaultSalesChannel[0].id,
            },
          ],
        },
        // Pickups
        {
          title: "Sac 1m3",
          collection_id: collectionResult.find(
            (collection) => collection.title === "Pickups"
          ).id,
          description:
            "Utilisez ce Big Sack pour les déchets lourds tels que le béton, les briques et la terre.",
          handle: "pickup-1m3",
          status: ProductStatus.PUBLISHED,
          images: [
            {
              url: "http://localhost:9000/static/bag_1m3.jpg",
            },
          ],
          options: [
            {
              title: "waste-type",
              values: [
                "asbestos",
                "construction",
                "incinerable",
                "recyclable",
                "to-sort",
              ],
            },
          ],
          variants: [
            {
              title: "asbestos",
              options: {
                "waste-type": "asbestos",
              },
              prices: [
                {
                  amount: 270,
                  currency_code: "chf",
                },
              ],
            },
            {
              title: "construction",
              options: {
                "waste-type": "construction",
              },
              prices: [
                {
                  amount: 165,
                  currency_code: "chf",
                },
              ],
            },
            {
              title: "incinerable",
              options: {
                "waste-type": "incinerable",
              },
              prices: [
                {
                  amount: 170,
                  currency_code: "chf",
                },
              ],
            },
            {
              title: "recyclable",
              options: {
                "waste-type": "recyclable",
              },
              prices: [
                {
                  amount: 110,
                  currency_code: "chf",
                },
              ],
            },
            {
              title: "to-sort",
              options: {
                "waste-type": "to-sort",
              },
              prices: [
                {
                  amount: 230,
                  currency_code: "chf",
                },
              ],
            },
          ],
          sales_channels: [
            {
              id: defaultSalesChannel[0].id,
            },
          ],
        },
        {
          title: "LARGE 2m3",
          collection_id: collectionResult.find(
            (collection) => collection.title === "Pickups"
          ).id,
          description:
            "Utilisez ce Big Sack pour les déchets lourds tels que le béton, les briques et la terre.",
          handle: "pickup-2m3",
          status: ProductStatus.PUBLISHED,
          images: [
            {
              url: "http://localhost:9000/static/bag_2m3.jpg",
            },
          ],
          options: [
            {
              title: "waste-type",
              values: [
                "asbestos",
                "construction",
                "incinerable",
                "recyclable",
                "to-sort",
              ],
            },
          ],
          variants: [
            {
              title: "asbestos",
              options: {
                "waste-type": "asbestos",
              },
              prices: [
                {
                  amount: 370,
                  currency_code: "chf",
                },
              ],
            },
            {
              title: "construction",
              options: {
                "waste-type": "construction",
              },
              prices: [
                {
                  amount: 210,
                  currency_code: "chf",
                },
              ],
            },
            {
              title: "incinerable",
              options: {
                "waste-type": "incinerable",
              },
              prices: [
                {
                  amount: 200,
                  currency_code: "chf",
                },
              ],
            },
            {
              title: "recyclable",
              options: {
                "waste-type": "recyclable",
              },
              prices: [
                {
                  amount: 135,
                  currency_code: "chf",
                },
              ],
            },
            {
              title: "to-sort",
              options: {
                "waste-type": "to-sort",
              },
              prices: [
                {
                  amount: 260,
                  currency_code: "chf",
                },
              ],
            },
          ],
          sales_channels: [
            {
              id: defaultSalesChannel[0].id,
            },
          ],
        },
        {
          title: "XL 3m3",

          collection_id: collectionResult.find(
            (collection) => collection.title === "Pickups"
          ).id,
          description:
            "Utilisez ce Big Sack pour les déchets lourds tels que le béton, les briques et la terre.",
          handle: "pickup-3m3",
          status: ProductStatus.PUBLISHED,
          images: [
            {
              url: "http://localhost:9000/static/bag_3m3.jpg",
            },
          ],
          options: [
            {
              title: "waste-type",
              values: ["incinerable", "recyclable", "to-sort"],
            },
          ],
          variants: [
            {
              title: "incinerable",
              options: {
                "waste-type": "incinerable",
              },
              prices: [
                {
                  amount: 250,
                  currency_code: "chf",
                },
              ],
            },
            {
              title: "recyclable",
              options: {
                "waste-type": "recyclable",
              },
              prices: [
                {
                  amount: 170,
                  currency_code: "chf",
                },
              ],
            },
            {
              title: "to-sort",
              options: {
                "waste-type": "to-sort",
              },
              prices: [
                {
                  amount: 325,
                  currency_code: "chf",
                },
              ],
            },
          ],
          sales_channels: [
            {
              id: defaultSalesChannel[0].id,
            },
          ],
        },
      ],
    },
  });
  logger.info("Finished seeding product data.");
}
