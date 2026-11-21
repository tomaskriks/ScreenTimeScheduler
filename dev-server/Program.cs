// Local test server only: serves ../docs (the published site) on http://localhost:5080.
using Microsoft.Extensions.FileProviders;

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls("http://localhost:5080");
var app = builder.Build();

var site = new PhysicalFileProvider(
    Path.GetFullPath(Path.Combine(builder.Environment.ContentRootPath, "..", "docs")));

app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = site });
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = site,
    ServeUnknownFileTypes = true,
    OnPrepareResponse = ctx => ctx.Context.Response.Headers.CacheControl = "no-cache",
});

app.Run();
