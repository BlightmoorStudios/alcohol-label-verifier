using System;
using System.IO;
using System.Threading.Tasks;
using System.Linq;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Tesseract;

namespace AlcoholLabelVerification.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AlcoholVerificationController : ControllerBase
    {
        [HttpPost("verify")]
        [Consumes("multipart/form-data")]
        public async Task<IActionResult> Verify(IFormFile image)
        {
            if (image == null || image.Length == 0)
            {
                return BadRequest("Please upload an image file.");
            }
            try
            {
                using var memoryStream = new MemoryStream();
                await image.CopyToAsync(memoryStream);
                var imageBytes = memoryStream.ToArray();

                return ProcessImageBytes(imageBytes);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error processing image: {ex.Message}");
            }
        }

        private IActionResult ProcessImageBytes(byte[] imageBytes)
        {
            using var engine = new TesseractEngine("./tessdata", "eng", EngineMode.Default);
            using var img = Pix.LoadFromMemory(imageBytes);
            using var page = engine.Process(img);
            string extractedText = page.GetText() ?? string.Empty;
            var lines = extractedText.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries).Select(l => l.Trim()).Where(l => !string.IsNullOrWhiteSpace(l)).ToArray();

            //ttb checks for specific keywords
            bool hasClassType = extractedText.Contains("Whiskey", StringComparison.OrdinalIgnoreCase) || extractedText.Contains("Bourbon", StringComparison.OrdinalIgnoreCase) || extractedText.Contains("Beer", StringComparison.OrdinalIgnoreCase) || extractedText.Contains("Wine", StringComparison.OrdinalIgnoreCase);
            bool hasAlcoholContent = extractedText.Contains("ABV", StringComparison.OrdinalIgnoreCase) || extractedText.Contains("%", StringComparison.OrdinalIgnoreCase) || extractedText.Contains("Proof", StringComparison.OrdinalIgnoreCase);
            bool hasNetContents = extractedText.Contains("mL", StringComparison.OrdinalIgnoreCase) || extractedText.Contains("oz", StringComparison.OrdinalIgnoreCase);

            //keywords
            var governmentKeywords = new[] { "Government Warning", "Surgeon General", "Federal", "Warning" };
            var abvKeywords = new[] { "ABV", "Proof", "Alcohol by Volume" };
            var safetyKeywords = new[] { "Keep out of reach", "Not for sale", "Age", "Drink responsibly" };

            //find specific numeric amounts for alcohol %
            var percentMatches = System.Text.RegularExpressions.Regex.Matches(extractedText, @"\d+(?:\.\d+)?\s*%(?:\s*(?:Alc\.?/Vol\.?|Alcohol by Volume))?(?:\s*\([^\)]*\))?", System.Text.RegularExpressions.RegexOptions.IgnoreCase)
                .Cast<System.Text.RegularExpressions.Match>().Select(m => m.Value.Trim()).ToList();
            var proofMatches = System.Text.RegularExpressions.Regex.Matches(extractedText, @"\d+(?:\.\d+)?\s*(?:proof)\b", System.Text.RegularExpressions.RegexOptions.IgnoreCase)
                .Cast<System.Text.RegularExpressions.Match>().Select(m => m.Value.Trim()).ToList();
            //gov keyword check
            var govList = governmentKeywords.Where(k => extractedText.Contains(k, StringComparison.OrdinalIgnoreCase)).ToList();

            //pull full warning if there
            string warningText = string.Empty;
            //line index where the warning header appears
            var warningStartIdx = Array.FindIndex(lines, l => governmentKeywords.Any(k => l.IndexOf(k, StringComparison.OrdinalIgnoreCase) >= 0));
            if (warningStartIdx >= 0)
            {
                var collected = new System.Collections.Generic.List<string>();
                bool seen1 = false, seen2 = false;
                int consecutiveBlank = 0;
                // allow up to 100 lines to be safe for long warnings
                for (int j = warningStartIdx; j < lines.Length && j < warningStartIdx + 100; j++)
                {
                    var ln = lines[j];
                    collected.Add(ln);
                    if (!string.IsNullOrWhiteSpace(ln))
                    {
                        consecutiveBlank = 0;
                        if (ln.IndexOf("(1)", StringComparison.OrdinalIgnoreCase) >= 0 || System.Text.RegularExpressions.Regex.IsMatch(ln, @"^\(?1[.)]", System.Text.RegularExpressions.RegexOptions.IgnoreCase)) seen1 = true;
                        if (ln.IndexOf("(2)", StringComparison.OrdinalIgnoreCase) >= 0 || System.Text.RegularExpressions.Regex.IsMatch(ln, @"^\(?2[.)]", System.Text.RegularExpressions.RegexOptions.IgnoreCase)) seen2 = true;
                    }
                    else
                    {
                        consecutiveBlank++;
                    }
                    if ((seen1 && seen2) || consecutiveBlank >= 2) break;
                }
                warningText = string.Join("\n", collected).Trim();
            }
            var hasGovernmentWarning = !string.IsNullOrEmpty(warningText) || govList.Any();
            //abv matches and keywords
            var abvList = new List<string>();
            if (percentMatches.Any()) abvList.AddRange(percentMatches);
            if (proofMatches.Any()) abvList.AddRange(proofMatches);
            if (!abvList.Any()) abvList.AddRange(abvKeywords.Where(k => extractedText.Contains(k, StringComparison.OrdinalIgnoreCase)));
            var safetyList = safetyKeywords.Where(k => extractedText.Contains(k, StringComparison.OrdinalIgnoreCase)).ToList();
            var keywordsTriggered = govList.Concat(abvList).Concat(safetyList).ToList();
            bool passes = hasGovernmentWarning && (hasAlcoholContent || hasNetContents);

            //detected values
            string status = passes ? "Pass" : "Fail";

            //possible brands
            var brandCandidate = lines.FirstOrDefault() ?? string.Empty;
            try
            {
                string best = brandCandidate;
                int bestScore = -1;

                //exclude unlikely brand words
                string[] excludePatterns = new[] { "DISTILLED", "BOTTLED BY", "BOTTLED", "DISTILLED AND BOTTLED", "GOVERNMENT WARNING", "ALC", "%", "ML", "OZ", "PRODUCED BY", "DISTRIBUTED BY", "IMPORT", "STRAIGHT", "WHISKY", "WHISKEY", "CLASS" };
                int scanCount = Math.Min(lines.Length, 8);
                for (int i = 0; i < scanCount; i++)
                {
                    var ln = lines[i];
                    if (string.IsNullOrWhiteSpace(ln)) continue;
                    var uln = ln.ToUpperInvariant();
                    bool excluded = excludePatterns.Any(p => uln.Contains(p));
                    if (excluded)
                    {
                        if (uln.Contains("DISTILLERY") && !uln.Contains("DISTILLED"))
                        {
                            excluded = false;
                        }
                    }
                    if (excluded) continue;
                    if (System.Text.RegularExpressions.Regex.IsMatch(ln, "^[0-9\\s:-]+$")) continue;
                    var words = ln.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                    int wordCount = words.Length;
                    if (wordCount > 6) continue; // too long to be a brand header

                    int upperCount = ln.Count(c => char.IsUpper(c));
                    int alphaCount = ln.Count(c => char.IsLetter(c));
                    double upperRatio = alphaCount > 0 ? (double)upperCount / alphaCount : 0;

                    //checking font for uppercase only
                    int score = (int)(upperCount * 3 + upperRatio * 50 - ln.Length / 5 + (scanCount - i) * 2);
                    if (wordCount == 1 && ln.Length <= 6) score += 30;
                    if (uln.Contains("DISTILLERY") || uln.Contains("CO.") || uln.Contains("COMPANY") || uln.All(c => !char.IsLetterOrDigit(c) || char.IsUpper(c))) score += 15;

                    if (score > bestScore)
                    {
                        bestScore = score;
                        best = ln;
                    }
                }

                if (!string.IsNullOrWhiteSpace(best)) brandCandidate = best;
            }
            catch
            {
                // ignore and fallback to first line
            }

            // Improved brand detection heuristics
            bool hasBrandName = false;
            try
            {
                var brandIndicators = new[] { "Distillery", "Distillers", "Brewery", "Brewing", "Co.", "Company", "Distilled", "LLC", "Ltd", "Inc", "Limited", "Distillers", "Distillery" };
                if (!string.IsNullOrWhiteSpace(brandCandidate))
                {
                    var bc = brandCandidate.Trim();
                    //remove leading numbers
                    bc = System.Text.RegularExpressions.Regex.Replace(bc, "^[0-9]+\\s*[:.-]?\\s*", "");
                    bc = System.Text.RegularExpressions.Regex.Replace(bc, "^(DISTILLED AND BOTTLED BY\\s*:?)\\s*", "", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                    bc = bc.Trim();
                    //remove late puncuation
                    bc = bc.Trim().TrimEnd(':', '-', '.', ',');
                    if (brandIndicators.Any(ind => bc.IndexOf(ind, StringComparison.OrdinalIgnoreCase) >= 0))
                    {
                        hasBrandName = true;
                    }
                    else
                    {
                        //uppercase and short brand possibiliteis
                        int upperCount = bc.Count(c => char.IsUpper(c));
                        if (upperCount >= Math.Max(2, bc.Length / 2) && bc.Length <= 60)
                        {
                            hasBrandName = true;
                        }
                        else
                        {
                            var words = bc.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                            if (words.Length == 1 && bc.Length <= 6 && bc.All(c => !char.IsLetter(c) || char.IsUpper(c)))
                            {
                                hasBrandName = true;
                            }
                        }
                    }
                }
            }
            catch
            {
                hasBrandName = !string.IsNullOrWhiteSpace(brandCandidate) && brandCandidate.Length > 1;
            }

            //look for common class keywords
            var possibleClasses = new[] { "Whiskey", "Bourbon", "Beer", "Wine" };
            var classType = possibleClasses.FirstOrDefault(c => extractedText.Contains(c, StringComparison.OrdinalIgnoreCase)) ?? string.Empty;

            //try to extract % or proof
            var alcoholContent = string.Empty;
            if (percentMatches.Any()) alcoholContent = string.Join("; ", percentMatches);
            else if (proofMatches.Any()) alcoholContent = string.Join("; ", proofMatches);
            else
            {
                var abvMatch = System.Text.RegularExpressions.Regex.Match(extractedText, @"\b\d+(\.\d+)?\s*%|\b\d+\s*proof", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                alcoholContent = abvMatch.Success ? abvMatch.Value.Trim() : string.Empty;
            }

            //total contents
            var netMatch = System.Text.RegularExpressions.Regex.Match(extractedText, @"\b\d+(\.\d+)?\s*(mL|ml|oz|L|l|liters|fl oz)\b", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            var netContents = netMatch.Success ? netMatch.Value.Trim() : string.Empty;

            //bottler or company
            var bottlerMatch = System.Text.RegularExpressions.Regex.Match(extractedText, @"(?:Bottled by|Bottled and distributed by|Produced by|Distilled by)\s*[:\-\s]*([^\r\n,]+)", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            var bottler = bottlerMatch.Success ? bottlerMatch.Groups[1].Value.Trim() : string.Empty;

            //country made in or product of
            var countryMatch = System.Text.RegularExpressions.Regex.Match(extractedText, @"(?:Made in|Product of)\s*[:\-\s]*([^\r\n,]+)", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            var country = countryMatch.Success ? countryMatch.Groups[1].Value.Trim() : string.Empty;
            var hasAbv = hasAlcoholContent;
            var hasSafetyWarning = safetyList.Any();

            //producer info
            bool hasProducerInfo = !string.IsNullOrEmpty(bottler) || lines.Any(l => l.IndexOf("Produced by", StringComparison.OrdinalIgnoreCase) >= 0 || l.IndexOf("Imported by", StringComparison.OrdinalIgnoreCase) >= 0 || l.IndexOf("Distributed by", StringComparison.OrdinalIgnoreCase) >= 0);
            //list of requirements
            var requirements = new System.Collections.Generic.Dictionary<string, object>();
            bool reqGovernmentWarning = hasGovernmentWarning && !string.IsNullOrWhiteSpace(warningText);
            bool reqAlcoholContent = !string.IsNullOrWhiteSpace(alcoholContent);
            bool reqBrandName = hasBrandName && !string.IsNullOrWhiteSpace(brandCandidate);
            bool reqNetContents = !string.IsNullOrWhiteSpace(netContents);
            bool reqProducerInfo = hasProducerInfo;
            requirements["GovernmentWarning"] = new { Passed = reqGovernmentWarning, Detected = hasGovernmentWarning, Text = warningText };
            requirements["AlcoholContent"] = new { Passed = reqAlcoholContent, Detected = reqAlcoholContent ? alcoholContent : (object)null };
            requirements["BrandName"] = new { Passed = reqBrandName, Detected = brandCandidate };
            requirements["NetContents"] = new { Passed = reqNetContents, Detected = netContents };
            requirements["ProducerInfo"] = new { Passed = reqProducerInfo, Detected = hasProducerInfo ? bottler : (object)null };

            //decide pass/fail info
            bool overallPass = reqGovernmentWarning && reqAlcoholContent && reqBrandName && reqNetContents;

            var failed = new System.Collections.Generic.List<string>();
            if (!reqGovernmentWarning) failed.Add("Government Warning missing or incomplete");
            if (!reqAlcoholContent) failed.Add("Alcohol content (ABV/Proof/%) missing");
            if (!reqBrandName) failed.Add("Brand name could not be detected");
            if (!reqNetContents) failed.Add("Net contents (volume) missing");

            //final result
            var result = new
            {
                Status = overallPass ? "Pass" : "Fail",
                ExtractedText = extractedText.Trim(),
                Confidence = page.GetMeanConfidence(),
                Requirements = requirements,
                FailedReasons = failed,
                KeywordsTriggered = new
                {
                    Government = govList,
                    ABV = abvList,
                    Safety = safetyList,
                    All = keywordsTriggered
                },
                Detected = new
                {
                    Brand = new { Value = brandCandidate },
                    ClassType = new { Value = classType },
                    AlcoholContent = new { Value = alcoholContent, Keywords = abvList },
                    NetContents = new { Value = netContents },
                    Bottler = new { Value = bottler },
                    Country = new { Value = country },
                    GovernmentWarning = new { Present = hasGovernmentWarning, Matches = govList, Text = warningText }
                },
                Message = overallPass ? "Label meets required TTB elements." : "Label is missing required TTB information."
            };

            return Ok(result);
        }
    }
}
