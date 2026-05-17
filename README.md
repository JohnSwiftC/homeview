# homeview

A three.js pipeline for rendering and visualizing home designs in proprty developments.

## Usecase and Motivation

View Homes does not currently have a fast, cheap, and reliable way for realtors and home designers to visualize home color-schemes / designs outside of manual modelling work.

Other solutions currently in-place, such as NanoBanana, are unreliable in how they are currently used (bad geometry, non-exact colors, inaccurate lighting).

This solution provides a simple, fast, rendering pipeline for the View Homes catalogue, matched with the paint and veneer providers used by builders. Designers can instantly see an accurate representation of their design in a web interface.

For "realistic" photos, generative AI is used for landscaping and other features such as glass and doors. The main increase in reliability is the fact that the image model will be fed a standardized 3D model to work off of when creating its output.

## Structure

Homeview works off of exported Revit models of designed homes. These models are manually edited to group meshes to share materials as well as labelling different assets used within the pipeline.

The pipeline itself loads _swatches_, an exported GLB containing materials used for the category of object they can be applied to. For example, see veneers.glb, which contains materials for use on veneers.

The main configuration file exposes different settings for matching models and their respective materials.

## Modelling and Materials

Homeview parses every material used in a model and creates a category of objects based off of it. These groups can be configured to either be ignored or used in the particular model.

In each group, a swatch can be assigned to define which materials can be swapped within the group.

Finally, for coherance across models, the UV scale of each material can be individually fine-tuned to ensure an accurate representation.
