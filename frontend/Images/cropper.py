from PIL import Image

# Load the image
img = Image.open("RooME.webp")
width, height = img.size

# Define the box: (left, top, right, bottom)
crop_box = (0, 100, width, height - 100)
cropped_img = img.crop(crop_box)

# Save with transparency preserved
cropped_img.save("RooME_cropped.webp", "WEBP", lossless=True)