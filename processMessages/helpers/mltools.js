const { BlobServiceClient } = require("@azure/storage-blob");
const { v4: uuidv4 } = require('uuid');
const { Readable } = require("stream");

exports.updateProjectFile = async (connectionString, containerName, blobName, projectFile, category = "None") => {
  // Create a BlobServiceClient instance
  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);

  // Get a reference to the container
  const containerClient = blobServiceClient.getContainerClient(containerName);

  // Get a reference to the project file blob
  const projectFileBlob = containerClient.getBlockBlobClient(projectFile);

  // Download the blob as a text string
  const downloadResponse = await projectFileBlob.download();
  const downloadedContent = await streamToString(downloadResponse.readableStreamBody);

  // Parse the downloaded JSON object
  const jsonObject = JSON.parse(downloadedContent);

  // add/update training dataset
  let documentsArray = jsonObject.assets.documents
  let targetDoc = documentsArray.find(doc => doc.location === blobName);

  if (targetDoc)
    targetDoc.class.category = category;
  else
    documentsArray.push({
      "location": blobName,
      "language": "bg",
      "class": {
        "category": category
      },
      "dataset": "Train"
    })

  // Convert the updated JSON object back to a string
  const updatedContent = JSON.stringify(jsonObject);

  // Upload the updated content to the blob
  const uploadResponse = await projectFileBlob.uploadStream(Readable.from([updatedContent]), updatedContent.length);

  console.log("File updated successfully");
}

async function streamToString(readableStream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readableStream.on("data", (data) => {
      chunks.push(data.toString());
    });
    readableStream.on("end", () => {
      resolve(chunks.join(""));
    });
    readableStream.on("error", reject);
  });
}




exports.createAzureBlob = async (connectionString, containerName, content) => {
  // Create a new BlobServiceClient using the connection string
  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);

  // Get a reference to the container
  const containerClient = blobServiceClient.getContainerClient(containerName);

  // Create the container if it does not exist
  await containerClient.createIfNotExists();

  // Generate a unique blob name
  const blobName = `${Date.now()}_${uuidv4()}.txt`;

  // Create a new block blob client
  const blobClient = containerClient.getBlockBlobClient(blobName);

  // Convert the string content to a Uint8Array
  const data = new TextEncoder().encode(content);

  // Upload the data to the blob
  await blobClient.uploadData(data, { blobHTTPHeaders: { blobContentType: "text/plain" } });

  console.log("String uploaded successfully");

  // Return the name of the blob
  return blobName;
}

/*
createAzureBlob(connectionString, containerName, content)
  .then((blobName) => {
    console.log("Blob Name:", blobName);
  })
  .catch((error) => {
    console.error("Error creating Azure Blob:", error);
  });*/
